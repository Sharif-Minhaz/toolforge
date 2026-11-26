"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { READING_REFRESH_MS } from "../domain/constants";
import { createFrameRecorder, readFrames, recordFrame } from "../domain/frames";
import type { FrameReading } from "../types";

/**
 * Records every `requestAnimationFrame` timestamp and publishes a reading a
 * few times a second.
 *
 * A hidden tab gets no frames, or throttled ones, so the loop stops on
 * `visibilitychange` and starts again — warm-up and all — on a fresh recorder
 * when the tab comes back. Carrying the old frames over would count the
 * whole absence as one enormous dropped frame.
 */
export function useFrameMeter(): { reading: FrameReading; restart: () => void } {
    const [reading, setReading] = useState<FrameReading>({ status: "warming_up" });
    const recorder = useRef(createFrameRecorder());

    useEffect(() => {
        let frame: number | null = null;

        const tick = (time: number) => {
            recordFrame(recorder.current, time);
            frame = window.requestAnimationFrame(tick);
        };

        const stop = () => {
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
                frame = null;
            }
        };

        const sync = () => {
            stop();
            recorder.current = createFrameRecorder();

            if (document.visibilityState === "visible") {
                frame = window.requestAnimationFrame(tick);
            }
        };

        const refresh = window.setInterval(
            () => setReading(readFrames(recorder.current)),
            READING_REFRESH_MS,
        );

        sync();
        document.addEventListener("visibilitychange", sync);

        return () => {
            stop();
            window.clearInterval(refresh);
            document.removeEventListener("visibilitychange", sync);
        };
    }, []);

    const restart = useCallback(() => {
        recorder.current = createFrameRecorder();
        setReading({ status: "warming_up" });
    }, []);

    return { reading, restart };
}
