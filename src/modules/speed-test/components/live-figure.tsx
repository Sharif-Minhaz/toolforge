"use client";

import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { approach } from "../domain/signal";

const HALF_LIFE_MS = 140;

type LiveFigureProps = {
    /** The raw value the figure is heading for — bits per second or milliseconds. */
    readonly target: number | null;
    readonly format: (value: number | null) => string;
    readonly unit: string;
    /** What the figure is: "Download", "Latency", "Press start". */
    readonly caption: ReactNode;
    readonly muted?: boolean;
};

/**
 * The big number. It counts toward each new measurement rather than jumping,
 * so a run reads as the line spinning up; remount it (a `key`) to count from
 * zero, as the workbench does when the unit changes. Reduced motion shows the
 * target as it is.
 *
 * Hidden from assistive technology: it changes many times a second. The tiles
 * and the status strip say the same thing at a pace a screen reader can keep.
 */
export function LiveFigure({ target, format, unit, caption, muted = false }: LiveFigureProps) {
    const reduceMotion = useReducedMotion() ?? false;
    const [shown, setShown] = useState(0);
    const shownRef = useRef(0);

    useEffect(() => {
        if (target === null || reduceMotion) {
            return;
        }

        let frame = 0;
        let last = 0;

        // State is set from the frame callback, never from the effect body.
        const step = (now: number) => {
            const elapsed = last === 0 ? 16 : now - last;
            const next = approach(shownRef.current, target, elapsed, HALF_LIFE_MS);
            const settled = Math.abs(target - next) <= Math.max(Math.abs(target) * 0.002, 0.01);

            last = now;
            shownRef.current = settled ? target : next;
            setShown(shownRef.current);
            frame = settled ? 0 : requestAnimationFrame(step);
        };

        frame = requestAnimationFrame(step);

        return () => cancelAnimationFrame(frame);
    }, [target, reduceMotion]);

    const value = target === null || reduceMotion ? target : shown;

    return (
        <div aria-hidden="true" className="flex flex-col items-center gap-1 text-center">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs leading-[1.3] font-medium">
                {caption}
            </p>
            <p className="flex items-baseline gap-2">
                <span
                    className={cn(
                        "font-mono text-6xl leading-none font-semibold tracking-tighter tabular-nums sm:text-7xl",
                        muted && "text-muted-foreground",
                    )}
                >
                    {format(value)}
                </span>
                <span className="text-muted-foreground text-base font-medium">{unit}</span>
            </p>
        </div>
    );
}
