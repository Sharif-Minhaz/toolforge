"use client";

import { useEffect, useRef, useState } from "react";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { SPEECH_ENDPOINT } from "../domain/constants";
import { createSpeechFrameReader } from "../domain/frames";
import { audioSecondsOf } from "../domain/mp3";
import {
    SCRIPT_FAILURE_REASONS,
    SPEECH_FAILURE_REASONS,
    type ScriptFailureReason,
    type SpeechFailureReason,
    type SpeechSettings,
    type SpeechVoiceId,
} from "../types";

/**
 * One press of Generate, from the request to a playable file.
 *
 * The audio is gathered in the tab and turned into a `Blob` only once the
 * server says `done` — never on the server, never stored. A stream that ends
 * without saying so is reported as `interrupted`, so a file that stops
 * mid-sentence is never offered as a finished one.
 */

export type SpeechInput = {
    readonly text: string;
    readonly voice: SpeechVoiceId;
    readonly settings: SpeechSettings;
};

export type SpeechAudio = SpeechInput & {
    readonly url: string;
    readonly blob: Blob;
    readonly seconds: number;
};

export type GenerationFailure = {
    readonly reason: SpeechFailureReason | ScriptFailureReason;
    readonly retryAfterSeconds?: number;
};

export type GenerationState =
    | { readonly phase: "idle" }
    | {
          readonly phase: "working";
          readonly step: number;
          readonly steps: number;
          readonly seconds: number;
      }
    | { readonly phase: "done" }
    | { readonly phase: "failed"; readonly failure: GenerationFailure };

const KNOWN_REASONS: ReadonlySet<string> = new Set([
    ...SCRIPT_FAILURE_REASONS,
    ...SPEECH_FAILURE_REASONS,
]);

function isReason(value: unknown): value is GenerationFailure["reason"] {
    return typeof value === "string" && KNOWN_REASONS.has(value);
}

/** The JSON a refusal carries, read defensively: a proxy's HTML error page is not one. */
async function readRefusal(response: Response): Promise<GenerationFailure> {
    try {
        const body: unknown = await response.json();

        if (
            typeof body === "object" &&
            body !== null &&
            "reason" in body &&
            isReason(body.reason)
        ) {
            const retry =
                "retryAfterSeconds" in body && typeof body.retryAfterSeconds === "number"
                    ? body.retryAfterSeconds
                    : undefined;

            return { reason: body.reason, retryAfterSeconds: retry };
        }
    } catch {
        // Fall through to the status-based answer below.
    }

    if (response.status === 429) {
        return { reason: "rate_limited" };
    }

    return { reason: response.status >= 500 ? "upstream_unavailable" : "invalid_request" };
}

export type SpeechGeneration = {
    readonly state: GenerationState;
    readonly audio: SpeechAudio | null;
    readonly generate: (input: SpeechInput, token: string) => Promise<boolean>;
    readonly cancel: () => void;
};

export function useSpeechGeneration(): SpeechGeneration {
    const [state, setState] = useState<GenerationState>({ phase: "idle" });
    const [audio, setAudio] = useState<SpeechAudio | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    // Revoked when replaced and when the page is left: one rule for every exit.
    useEffect(() => {
        const url = audio?.url;

        return () => {
            if (url !== undefined) {
                URL.revokeObjectURL(url);
            }
        };
    }, [audio?.url]);

    // A generation still streaming when the reader navigates away is
    // abandoned, which closes the server's session too.
    useEffect(() => () => controllerRef.current?.abort(), []);

    function fail(failure: GenerationFailure): false {
        setState({ phase: "failed", failure });

        return false;
    }

    /** Resolves `true` once a playable file is in hand. */
    async function generate(input: SpeechInput, token: string): Promise<boolean> {
        controllerRef.current?.abort();

        const controller = new AbortController();

        controllerRef.current = controller;
        setState({ phase: "working", step: 0, steps: 0, seconds: 0 });

        let response: Response;

        try {
            response = await fetch(SPEECH_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...input, token }),
                signal: controller.signal,
            });
        } catch (caught) {
            if (controller.signal.aborted) {
                return false;
            }

            logEvent("warn", "text_to_speech.request_failed", { error: describeError(caught) });

            return fail({ reason: "interrupted" });
        }

        if (!response.ok || response.body === null) {
            return fail(await readRefusal(response));
        }

        const reader = response.body.getReader();
        const frames = createSpeechFrameReader();
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let bytes = 0;
        let steps = 0;

        try {
            for (;;) {
                const { value, done } = await reader.read();

                if (done) {
                    break;
                }

                const decoded = frames.push(value);

                if (decoded === null) {
                    logEvent("error", "text_to_speech.stream_corrupt");

                    return fail({ reason: "interrupted" });
                }

                for (const frame of decoded) {
                    switch (frame.kind) {
                        case "audio":
                            parts.push(frame.bytes.slice());
                            bytes += frame.bytes.length;
                            break;
                        case "progress":
                            steps = frame.steps;
                            setState({
                                phase: "working",
                                step: frame.step,
                                steps,
                                seconds: audioSecondsOf(bytes),
                            });
                            break;
                        case "failure":
                            return fail({ reason: frame.reason });
                        case "done": {
                            const blob = new Blob(parts, { type: "audio/mpeg" });

                            setAudio({
                                ...input,
                                blob,
                                url: URL.createObjectURL(blob),
                                seconds: audioSecondsOf(bytes),
                            });
                            setState({ phase: "done" });

                            return true;
                        }
                    }
                }
            }
        } catch (caught) {
            if (controller.signal.aborted) {
                return false;
            }

            logEvent("warn", "text_to_speech.stream_failed", { error: describeError(caught) });
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
            }
        }

        // The body ended without `done`: the platform's time limit, or the
        // connection dropped. What arrived is a fragment, not a file.
        return fail({ reason: "interrupted" });
    }

    function cancel() {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState({ phase: "idle" });
    }

    return { state, audio, generate, cancel };
}
