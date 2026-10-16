import "server-only";

import { after } from "next/server";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";

import { MAX_SPEECH_REQUEST_BYTES } from "../domain/constants";
import { encodeSpeechFrame, type SpeechFrame } from "../domain/frames";
import { buildSilence } from "../domain/mp3";
import { planSpeech } from "../domain/plan";
import { toProsodyStrings } from "../domain/prosody";
import { getSpeechVoice } from "../domain/voices";
import type { SpeechFailureReason, SpeechPlan, SpeechRefusal } from "../types";
import { speechRequestSchema, type SpeechRequest } from "../validation/speech-request";
import { openSpeechSession, SpeechUpstreamError, type SpeechSession } from "./edge-speech";
import { isSpeechConfigured, spendSpeechQuota, sweepSpeechQuotaRows } from "./speech-quota";

/**
 * `POST /api/text-to-speech`, everything but the plumbing.
 *
 * A Route Handler rather than a Server Action because the answer streams: a
 * long script takes over a minute, and the reader watches it arrive. An
 * action's reply is one value, sent when it is finished.
 *
 * The order of the gates is the security argument, cheapest first, and each
 * one is where it is for a reason:
 *
 * 1. **Size, then shape, then the script** — all local and free. A typo must
 *    not cost a database write or a Turnstile round trip.
 * 2. **Configured?** A deployment without a salt cannot meter, so it does not
 *    serve. Checked before the challenge so an unconfigured server says so
 *    plainly instead of spending a token.
 * 3. **Turnstile, then quota** — the order `docs/security.md` sets: a script
 *    without a browser is refused before it can spend anybody's allowance.
 * 4. **Then the service**, which is the only expensive thing here.
 *
 * Nothing the reader typed is logged. The events below record that the
 * service failed and which voice it failed for — enough to see an outage, not
 * enough to know what anybody said.
 */

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
};

function refuse(
    status: number,
    reason: SpeechRefusal["reason"],
    retryAfterSeconds?: number,
): Response {
    const body: SpeechRefusal =
        retryAfterSeconds === undefined
            ? { ok: false, reason }
            : { ok: false, reason, retryAfterSeconds };
    const headers = new Headers(JSON_HEADERS);

    if (retryAfterSeconds !== undefined) {
        headers.set("Retry-After", String(retryAfterSeconds));
    }

    return new Response(JSON.stringify(body), { status, headers });
}

async function readRequest(request: Request): Promise<SpeechRequest | null> {
    // Declared length first, so an oversized body is refused before any of it
    // is buffered; then measured again, because a chunked body declares none.
    const declared = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(declared) && declared > MAX_SPEECH_REQUEST_BYTES) {
        return null;
    }

    let raw: string;

    try {
        raw = await request.text();
    } catch {
        return null;
    }

    if (raw.length > MAX_SPEECH_REQUEST_BYTES) {
        return null;
    }

    try {
        const parsed = speechRequestSchema.safeParse(JSON.parse(raw));

        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export async function handleSpeechRequest(request: Request): Promise<Response> {
    const body = await readRequest(request);

    if (body === null) {
        return refuse(400, "invalid_request");
    }

    const plan = planSpeech(body.text);

    if (!plan.ok) {
        return refuse(400, plan.reason);
    }

    if (!isSpeechConfigured() || !process.env.TURNSTILE_SECRET) {
        logEvent("warn", "text_to_speech.not_configured");

        return refuse(503, "not_configured");
    }

    // An unreadable address still meters: everything behind one opaque proxy
    // shares a bucket, which is worse for them and no gap at all.
    const address = resolveRemoteIp(request.headers) ?? "unknown";
    const challenge = await verifyTurnstileToken(body.token, address);

    if (!challenge.ok) {
        return challenge.reason === "challenge_failed"
            ? refuse(403, "challenge_failed")
            : refuse(
                  503,
                  challenge.reason === "not_configured"
                      ? "not_configured"
                      : "challenge_unavailable",
              );
    }

    const spent = await spendSpeechQuota(address);

    if (spent === null) {
        return refuse(503, "not_configured");
    }

    if (spent.windowOpened) {
        // Off the response path, and only when a fresh window opened.
        after(() => sweepSpeechQuotaRows());
    }

    if (!spent.verdict.allowed) {
        return refuse(429, "rate_limited", spent.verdict.retryAfterSeconds);
    }

    return new Response(streamSpeech(body, plan, request.signal), {
        status: 200,
        headers: {
            "Content-Type": "application/octet-stream",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

/**
 * The plan, carried out in order, framed as it goes — see `frames.ts` for why
 * the body is framed rather than bare MP3.
 *
 * The reader leaving stops the work. Either signal can arrive first — the
 * request's `abort`, or the runtime cancelling the body it was streaming — and
 * both close the session at once rather than leave the service speaking a
 * minute of audio nobody will hear.
 */
function streamSpeech(
    body: SpeechRequest,
    plan: SpeechPlan,
    signal: AbortSignal,
): ReadableStream<Uint8Array> {
    const voice = getSpeechVoice(body.voice);
    const prosody = toProsodyStrings(body.settings);

    let session: SpeechSession | null = null;
    let gone = false;

    const leave = () => {
        gone = true;
        session?.close();
    };

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            // Writing to a body whose reader has left throws; once gone there
            // is nobody to tell, so every write after that is dropped.
            const send = (frame: SpeechFrame) => {
                if (gone) {
                    return;
                }

                try {
                    controller.enqueue(encodeSpeechFrame(frame));
                } catch {
                    leave();
                }
            };

            const finish = (failure: SpeechFailureReason | null) => {
                session?.close();
                send(failure === null ? { kind: "done" } : { kind: "failure", reason: failure });

                try {
                    controller.close();
                } catch {
                    // Already closed by a cancel; nothing left to end.
                }
            };

            signal.addEventListener("abort", leave, { once: true });

            let spokenBytes = 0;

            try {
                send({ kind: "progress", step: 0, steps: plan.steps.length });
                session = await openSpeechSession(voice);

                for (const [index, step] of plan.steps.entries()) {
                    if (gone) {
                        break;
                    }

                    if (step.kind === "pause") {
                        send({ kind: "audio", bytes: buildSilence(step.seconds) });
                    } else {
                        for await (const bytes of session.speak(step.text, prosody)) {
                            spokenBytes += bytes.length;
                            send({ kind: "audio", bytes });
                        }
                    }

                    send({ kind: "progress", step: index + 1, steps: plan.steps.length });
                }

                // Every piece ended normally and none had a sound in it: the
                // service accepted the voice name and said nothing, which is
                // what it does for a voice it has withdrawn.
                if (spokenBytes === 0 && !gone) {
                    logEvent("warn", "text_to_speech.no_audio", { voice: voice.id });
                    finish("voice_unavailable");

                    return;
                }

                finish(null);
            } catch (caught) {
                const reason =
                    caught instanceof SpeechUpstreamError ? caught.reason : "upstream_unavailable";

                // A failure caused by the reader leaving is not the service's.
                if (!gone) {
                    logEvent("error", "text_to_speech.upstream_failed", {
                        voice: voice.id,
                        reason,
                        error: describeError(caught),
                    });
                }

                finish(reason);
            } finally {
                signal.removeEventListener("abort", leave);
            }
        },
        cancel() {
            leave();
        },
    });
}
