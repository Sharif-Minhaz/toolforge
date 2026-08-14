"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { CASE_SAMPLES } from "../domain/samples";
import type { TextCase } from "../types";
import { useCaseName } from "./use-case-name";

type CasePickerProps = {
    value: TextCase;
    labelId: string;
    onChange: (textCase: TextCase) => void;
};

/**
 * Fourteen chips, each showing the same three words put through its own case.
 *
 * The name alone would not do the job. "Title Case" and "Capitalized Case" are
 * one word apart in English and translate to something similar again, while
 * `Two of Us` beside `Two Of Us` is the whole difference at a glance — and in
 * Bangla, where the script has no case at all, the sample is the only thing on
 * the chip that can show what the case will do.
 *
 * So the two halves come from two places on purpose: the name is copy and is
 * translated, the sample is data and reads the same everywhere.
 */
export function CasePicker({ value, labelId, onChange }: CasePickerProps) {
    const nameOf = useCaseName();

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
        >
            {CASE_SAMPLES.map(({ textCase, sample }) => {
                const selected = textCase === value;

                return (
                    <button
                        key={textCase}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(textCase)}
                        className={cn(
                            "relative flex min-w-0 cursor-pointer flex-col items-start gap-0.5 rounded-xl px-3 py-2",
                            "ring-1 transition-colors duration-200 outline-none ring-inset",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "ring-transparent"
                                : "bg-card/60 ring-border/70 hover:bg-card hover:ring-border",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId="text-case-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                aria-hidden="true"
                                className="bg-primary/10 ring-primary/45 absolute inset-0 rounded-xl ring-1 ring-inset"
                            />
                        )}

                        <span
                            className={cn(
                                "relative w-full truncate text-left text-[0.8125rem] leading-[1.3] font-medium",
                                selected ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {nameOf(textCase)}
                        </span>
                        {/* The sample is what the case does, not a label for it,
                            so it is hidden from the accessible name — a screen
                            reader announcing "Title Case, Two of Us" twice over
                            fourteen chips is noise. */}
                        <span
                            aria-hidden="true"
                            className={cn(
                                "relative w-full truncate text-left font-mono text-[0.6875rem] leading-[1.4]",
                                selected ? "text-primary" : "text-muted-foreground/70",
                            )}
                        >
                            {sample}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
