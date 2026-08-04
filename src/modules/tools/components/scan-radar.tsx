"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { MOTION_EASE } from "@/components/motion/motion-tokens";
import { cn } from "@/lib/utils";

/**
 * A scan, while it is happening.
 *
 * This is the one place a tool spends any boldness, and it earns the space by
 * occupying it honestly: the work behind it is several round trips and
 * genuinely takes seconds, so the alternative is a spinner over an empty box.
 * The radar sits in the exact slot the result will take, so the swap reads as
 * one instrument settling rather than two components trading places.
 *
 * Everything is drawn from `--tool-accent`, which the page sets to the tool's
 * catalog hue, so it is themed in both palettes without a single literal
 * colour. The sweep is a conic gradient on a rotating layer, masked to a circle
 * — no SVG, no canvas, no per-frame work in React.
 *
 * Lifted out of the Domain Inspector when the Port Scanner needed the same
 * thing. Captions arrive already translated rather than as a namespace: the two
 * tools are doing different work behind the same sweep, and a component that
 * reached for one tool's messages would be that tool's component living in the
 * shared folder.
 */

const STAGE_MS = 1_400;

type ScanRadarProps = {
    /** Shown under the sweep, so the reader knows what is being scanned. */
    label: string;
    /**
     * Cycled one a stage while the sweep runs. Pass the stages genuinely in
     * flight; a single entry simply holds still, which is the honest choice
     * when the work is one round trip whose progress cannot be observed.
     */
    captions: readonly string[];
    /** Shown in place of the cycle when the reader has asked for less motion. */
    restingCaption: string;
    className?: string;
};

export function ScanRadar({ label, captions, restingCaption, className }: ScanRadarProps) {
    const reduceMotion = useReducedMotion();
    const [stage, setStage] = useState(0);

    const cycles = reduceMotion !== true && captions.length > 1;

    useEffect(() => {
        if (!cycles) {
            return;
        }

        const timer = setInterval(() => setStage((current) => current + 1), STAGE_MS);

        return () => clearInterval(timer);
    }, [cycles]);

    const caption =
        reduceMotion === true
            ? restingCaption
            : (captions[stage % captions.length] ?? restingCaption);

    return (
        <section
            aria-live="polite"
            aria-busy="true"
            className={cn(
                "bg-card ring-border/70 relative flex min-w-0 flex-col items-center gap-5 overflow-hidden rounded-2xl px-6 py-10 ring-1 ring-inset",
                className,
            )}
        >
            <span
                aria-hidden="true"
                className="bg-grid pointer-events-none absolute inset-0 opacity-[0.35]"
            />

            <div aria-hidden="true" className="relative grid size-40 place-items-center sm:size-48">
                {/* Range rings, at the weights an instrument would use. */}
                {[1, 0.72, 0.46, 0.22].map((scale, index) => (
                    <span
                        key={scale}
                        style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
                        className={cn(
                            "absolute rounded-full ring-1 ring-inset",
                            index === 0
                                ? "ring-[color-mix(in_oklch,var(--tool-accent)_38%,transparent)]"
                                : "ring-[color-mix(in_oklch,var(--tool-accent)_18%,transparent)]",
                        )}
                    />
                ))}

                {/* Cross hairs, at the reduced weight an instrument would use. */}
                <span className="absolute h-px w-full bg-[color-mix(in_oklch,var(--tool-accent)_14%,transparent)]" />
                <span className="absolute h-full w-px bg-[color-mix(in_oklch,var(--tool-accent)_14%,transparent)]" />

                {reduceMotion === true ? (
                    <span className="absolute size-2.5 rounded-full bg-[var(--tool-accent)]" />
                ) : (
                    <>
                        <motion.span
                            className="absolute size-full rounded-full"
                            style={{
                                background:
                                    "conic-gradient(from 0deg, transparent 0deg, transparent 250deg, color-mix(in oklch, var(--tool-accent) 26%, transparent) 340deg, color-mix(in oklch, var(--tool-accent) 62%, transparent) 359deg, transparent 360deg)",
                            }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2.6, ease: "linear", repeat: Infinity }}
                        />

                        {/* Two returns, offset so the sweep passes them apart. */}
                        {[
                            { top: "28%", left: "64%", delay: 0.4 },
                            { top: "63%", left: "37%", delay: 1.5 },
                        ].map((blip) => (
                            <motion.span
                                key={blip.delay}
                                className="absolute size-1.5 rounded-full bg-[var(--tool-accent)]"
                                style={{ top: blip.top, left: blip.left }}
                                animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 0.6] }}
                                transition={{
                                    duration: 2.6,
                                    delay: blip.delay,
                                    ease: MOTION_EASE,
                                    repeat: Infinity,
                                }}
                            />
                        ))}

                        <motion.span
                            className="absolute size-2.5 rounded-full bg-[var(--tool-accent)]"
                            animate={{ opacity: [0.55, 1, 0.55] }}
                            transition={{ duration: 2.6, ease: MOTION_EASE, repeat: Infinity }}
                        />
                    </>
                )}
            </div>

            <div className="relative flex min-w-0 flex-col items-center gap-1.5 text-center">
                <p className="max-w-full min-w-0 truncate font-mono text-sm">{label}</p>
                <p className="text-muted-foreground text-[0.6875rem] leading-normal tracking-[0.14em] uppercase">
                    {caption}
                </p>
            </div>
        </section>
    );
}
