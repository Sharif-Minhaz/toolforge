"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    MAX_SEPARATOR_LENGTH,
    SAFE_SEPARATOR_CHARACTERS,
    SEPARATOR_CHARACTERS,
} from "../domain/constants";
import { SLUG_SEPARATORS, type SlugSeparator } from "../types";

/**
 * Each preset shows the separator between two letters rather than on its own.
 * That is what the control is choosing, so it reads without a caption — and it
 * keeps the four glyphs on a shared baseline, which `-` and `.` alone do not.
 * The sample is data, not copy: it says the same thing in either locale.
 */
const SAMPLE_LEFT = "a";
const SAMPLE_RIGHT = "b";

type SeparatorPickerProps = {
    value: SlugSeparator;
    customSeparator: string;
    /** Set when the typed separator holds something a URL would have to escape. */
    invalid: boolean;
    labelId: string;
    onChange: (separator: SlugSeparator) => void;
    onCustomChange: (custom: string) => void;
};

export function SeparatorPicker({
    value,
    customSeparator,
    invalid,
    labelId,
    onChange,
    onCustomChange,
}: SeparatorPickerProps) {
    const t = useTranslations("slug.workbench");
    const tSeparators = useTranslations("slug.separators");
    const customHintId = useId();
    const custom = value === "custom";

    return (
        <div className="flex flex-col gap-2">
            {/* Sized to its content rather than stretched across the card: five
                one-character choices do not need the full width, and spreading
                them leaves each glyph stranded in the middle of a wide cell. */}
            <div className="flex flex-wrap items-center gap-2">
                <div
                    role="radiogroup"
                    aria-labelledby={labelId}
                    className="bg-muted/70 ring-border/60 inline-flex items-center gap-1 rounded-xl p-1 ring-1 ring-inset"
                >
                    {SLUG_SEPARATORS.map((separator) => {
                        const selected = separator === value;
                        const glyph =
                            separator === "custom" ? null : SEPARATOR_CHARACTERS[separator];

                        return (
                            <button
                                key={separator}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-label={tSeparators(separator)}
                                onClick={() => onChange(separator)}
                                className={cn(
                                    "relative flex h-9 items-center justify-center rounded-lg px-3",
                                    "transition-colors duration-200 outline-none",
                                    "focus-visible:ring-ring focus-visible:ring-2",
                                    selected
                                        ? "text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {selected && (
                                    <motion.span
                                        layoutId="slug-separator-indicator"
                                        transition={{
                                            type: "spring",
                                            stiffness: 480,
                                            damping: 38,
                                        }}
                                        className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                                    />
                                )}
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "relative leading-[1.3] whitespace-nowrap",
                                        glyph === null
                                            ? "text-[0.8125rem] font-medium"
                                            : "font-mono text-[0.8125rem]",
                                    )}
                                >
                                    {glyph === null ? (
                                        tSeparators("custom")
                                    ) : (
                                        <>
                                            <span className="text-muted-foreground/60">
                                                {SAMPLE_LEFT}
                                            </span>
                                            <span className="text-base">{glyph}</span>
                                            <span className="text-muted-foreground/60">
                                                {SAMPLE_RIGHT}
                                            </span>
                                        </>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Sits in the same row as the button it belongs to, so the
                    field reads as part of that choice rather than a stray box. */}
                {custom && (
                    <Input
                        value={customSeparator}
                        maxLength={MAX_SEPARATOR_LENGTH}
                        spellCheck={false}
                        autoComplete="off"
                        aria-label={t("customSeparatorLabel")}
                        aria-invalid={invalid}
                        aria-describedby={customHintId}
                        // No placeholder: an empty field is a real answer here
                        // — it joins the words with nothing — and a ghost value
                        // would make that look like a field nobody had filled.
                        onChange={(event) => onCustomChange(event.target.value)}
                        className={cn(
                            "h-11 w-20 rounded-xl text-center font-mono text-base tracking-widest",
                            invalid && "border-destructive",
                        )}
                    />
                )}
            </div>

            {custom && (
                <p
                    id={customHintId}
                    className="text-muted-foreground max-w-[52ch] text-[0.6875rem] leading-[1.4]"
                >
                    {t("customSeparatorHint", { characters: SAFE_SEPARATOR_CHARACTERS })}
                </p>
            )}
        </div>
    );
}
