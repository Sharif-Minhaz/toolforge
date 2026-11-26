"use client";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";

type WordsLineProps = {
    label: string;
    copyLabel: string;
    words: string;
    numeral: string;
    /** The language the words are written in, for a screen reader's voice. */
    lang: "en" | "bn";
    copied: boolean;
    dimmed: boolean;
    onCopy: () => void;
};

/**
 * One language's reading: its name, the words large enough to check against a
 * cheque, the grouped numeral beneath, and a copy button.
 */
export function WordsLine({
    label,
    copyLabel,
    words,
    numeral,
    lang,
    copied,
    dimmed,
    onCopy,
}: WordsLineProps) {
    return (
        <div className="bg-card ring-border/70 flex min-w-0 flex-col gap-2 rounded-lg p-3 ring-1 ring-inset sm:p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs leading-[1.3] font-medium">
                    {label}
                </span>
                <IconCopyButton
                    copied={copied}
                    onClick={onCopy}
                    disabled={words.length === 0}
                    aria-label={copyLabel}
                    className="disabled:pointer-events-none disabled:opacity-40"
                />
            </div>
            <p
                lang={lang}
                className={cn(
                    "min-h-7 text-[1.0625rem] leading-[1.6] font-medium break-words",
                    "transition-opacity duration-200",
                    dimmed && "opacity-55",
                )}
            >
                {words}
            </p>
            {numeral.length > 0 && (
                <p
                    lang={lang}
                    className="text-muted-foreground font-mono text-xs break-all tabular-nums"
                >
                    {numeral}
                </p>
            )}
        </div>
    );
}
