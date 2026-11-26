"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { MAX_RECORDING_SECONDS } from "../domain/audio";

export type ClipState =
    | { readonly status: "idle" }
    | { readonly status: "recording"; readonly elapsed: number }
    | {
          readonly status: "ready";
          readonly url: string;
          /**
           * Measured here, because Chrome writes WebM without a duration and
           * its player shows none until the clip has played through.
           */
          readonly seconds: number;
      }
    | { readonly status: "failed" };

/**
 * A short clip of the live stream, held as an object URL in this tab.
 *
 * The stream ending — Stop, a new device, a processing switch — ends the
 * recording and keeps what was caught. The page going away discards it and
 * revokes the URL, so nothing outlives the visit.
 */
export function useClipRecorder(stream: MediaStream | null) {
    const [clip, setClip] = useState<ClipState>({ status: "idle" });
    // Unknown before hydration, so the button is offered rather than refused.
    const unsupported = useIsHydrated() && typeof MediaRecorder === "undefined";
    const recorderRef = useRef<MediaRecorder | null>(null);
    const timerRef = useRef<number | undefined>(undefined);
    const urlRef = useRef<string | null>(null);
    const activeRef = useRef(false);

    const stop = useCallback(() => {
        window.clearInterval(timerRef.current);
        const recorder = recorderRef.current;

        if (recorder !== null && recorder.state !== "inactive") {
            recorder.stop();
        }
    }, []);

    const forgetClip = useCallback(() => {
        if (urlRef.current !== null) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        }
    }, []);

    const start = useCallback(() => {
        if (stream === null) {
            return;
        }

        stop();
        forgetClip();
        const chunks: Blob[] = [];
        const startedAt = performance.now();
        let failed = false;

        try {
            // No type asked for: each browser records what it can play back.
            const recorder = new MediaRecorder(stream);

            recorder.addEventListener("dataavailable", (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            });
            recorder.addEventListener("error", (event) => {
                failed = true;
                logEvent("warn", "mic_tester.record_failed", { error: describeError(event.error) });
            });
            recorder.addEventListener("stop", () => {
                if (recorderRef.current !== recorder) {
                    return;
                }

                window.clearInterval(timerRef.current);
                recorderRef.current = null;

                if (!activeRef.current) {
                    return;
                }

                if (failed || chunks.length === 0) {
                    setClip({ status: "failed" });

                    return;
                }

                const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));

                urlRef.current = url;
                setClip({
                    status: "ready",
                    url,
                    seconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
                });
            });
            recorderRef.current = recorder;
            recorder.start();
        } catch (caught) {
            recorderRef.current = null;
            logEvent("warn", "mic_tester.record_failed", { error: describeError(caught) });
            setClip({ status: "failed" });

            return;
        }

        setClip({ status: "recording", elapsed: 0 });
        timerRef.current = window.setInterval(() => {
            const elapsed = Math.floor((performance.now() - startedAt) / 1000);

            if (elapsed >= MAX_RECORDING_SECONDS) {
                stop();

                return;
            }

            setClip({ status: "recording", elapsed });
        }, 250);
    }, [stream, stop, forgetClip]);

    // A new stream, or none, ends the recording of the old one.
    useEffect(() => stop, [stream, stop]);

    // Next keeps the page's state when the reader navigates away but runs
    // this cleanup: the clip is discarded and its memory released.
    useEffect(() => {
        activeRef.current = true;

        return () => {
            activeRef.current = false;
            stop();
            forgetClip();
            setClip({ status: "idle" });
        };
    }, [stop, forgetClip]);

    return { clip, unsupported, start, stop };
}
