import "server-only";

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

import { escapeSpeechText } from "../domain/chunks";
import { SPEECH_CONNECT_TIMEOUT_MS, SPEECH_IDLE_TIMEOUT_MS } from "../domain/constants";
import type { ProsodyStrings } from "../domain/prosody";
import type { SpeechVoice } from "../types";

/**
 * The only file that talks to Microsoft's Read Aloud service.
 *
 * Through `msedge-tts` rather than a client of our own, and the case study has
 * the reason in one line: the service is undocumented, its access token is
 * deliberately obscured, and it changed shape five times in two years — most
 * recently on 2026-10-13. A maintained client absorbs that churn; ours would be
 * one more thing to notice broke. The cost is that this tool goes down when the
 * service changes, until the package catches up, and the page says so.
 *
 * `msedge-tts` reports every failure as a plain `Error` with an English
 * message. They are sorted here, once, into reasons the page can name, and the
 * message never leaves this file.
 */

export type UpstreamFailureReason = "upstream_refused" | "upstream_unavailable" | "timed_out";

export class SpeechUpstreamError extends Error {
    readonly reason: UpstreamFailureReason;

    constructor(reason: UpstreamFailureReason, cause: unknown) {
        super(reason, { cause });
        this.name = "SpeechUpstreamError";
        this.reason = reason;
    }
}

function statusOf(error: unknown): number | null {
    if (typeof error !== "object" || error === null) {
        return null;
    }

    const own = "statusCode" in error ? error.statusCode : undefined;
    const cause = "cause" in error ? statusOf(error.cause) : null;

    return typeof own === "number" ? own : cause;
}

function classify(error: unknown): SpeechUpstreamError {
    if (error instanceof SpeechUpstreamError) {
        return error;
    }

    const message = error instanceof Error ? error.message : "";
    const status = statusOf(error);

    if (/timed out/iu.test(message)) {
        return new SpeechUpstreamError("timed_out", error);
    }

    // A handshake the service answers with 401, 403 or 429 is a refusal, not
    // an outage: the token scheme changed again, or this address is being
    // throttled. Kept apart because the page says different things about each.
    if (status === 401 || status === 403 || status === 429) {
        return new SpeechUpstreamError("upstream_refused", error);
    }

    return new SpeechUpstreamError("upstream_unavailable", error);
}

export type SpeechSession = {
    /** Yields the MP3 bytes for one piece of text as they arrive. Throws `SpeechUpstreamError`. */
    speak(text: string, prosody: ProsodyStrings): AsyncGenerator<Uint8Array, void, void>;
    close(): void;
};

/**
 * One connection for a whole generation, so a script cut into ten pieces costs
 * one handshake rather than ten. The client reconnects by itself if the service
 * drops the socket between pieces.
 */
export async function openSpeechSession(voice: SpeechVoice): Promise<SpeechSession> {
    const client = new MsEdgeTTS({
        connectionTimeoutMs: SPEECH_CONNECT_TIMEOUT_MS,
        synthesisTimeoutMs: SPEECH_IDLE_TIMEOUT_MS,
    });

    try {
        // The locale is passed rather than inferred: the client's guess reads
        // `iu-Cans-CA-SiqiniqNeural` as nothing it recognises and throws.
        await client.setMetadata(voice.id, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
            voiceLocale: voice.locale,
            sentenceBoundaryEnabled: false,
            wordBoundaryEnabled: false,
        });
    } catch (caught) {
        client.close();

        throw classify(caught);
    }

    return {
        async *speak(text, prosody) {
            const { audioStream } = client.toStream(escapeSpeechText(text), prosody);

            try {
                for await (const chunk of audioStream) {
                    yield chunk instanceof Uint8Array ? chunk : new Uint8Array(0);
                }
            } catch (caught) {
                throw classify(caught);
            } finally {
                audioStream.destroy();
            }
        },
        close() {
            client.close();
        },
    };
}
