"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { RegexLiteral } from "../domain/literal";
import {
    DELIMITER_CHARACTERS,
    type HighlightSpan,
    type RegexDelimiter,
    type RegexFlag,
} from "../types";
import { DelimiterMenu } from "./delimiter-menu";
import { FlagsMenu } from "./flags-menu";
import { PatternInput } from "./pattern-input";

type PatternFieldProps = {
    inputId: string;
    pattern: string;
    spans: readonly HighlightSpan[];
    delimiter: RegexDelimiter;
    flags: readonly RegexFlag[];
    invalid: boolean;
    copied: boolean;
    /** The counters, rendered opposite the label as in the reference layout. */
    stats: ReactNode;
    onPatternChange: (pattern: string) => void;
    onPasteLiteral: (literal: RegexLiteral) => void;
    onDelimiterChange: (delimiter: RegexDelimiter) => void;
    onToggleFlag: (flag: RegexFlag) => void;
    onCopy: () => void;
};

/** The pattern as it would be written down: delimiter, body, flags. */
export function PatternField({
    inputId,
    pattern,
    spans,
    delimiter,
    flags,
    invalid,
    copied,
    stats,
    onPatternChange,
    onPasteLiteral,
    onDelimiterChange,
    onToggleFlag,
    onCopy,
}: PatternFieldProps) {
    const t = useTranslations("regex.workbench");
    const character = DELIMITER_CHARACTERS[delimiter];

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    {t("patternLabel")}
                </Label>
                {stats}
            </div>

            <div
                className={cn(
                    "bg-card/60 ring-border/70 flex items-center gap-1 rounded-xl px-1.5 ring-1 ring-inset",
                    "focus-within:ring-ring transition-shadow duration-200 focus-within:ring-2",
                    invalid && "ring-destructive/45",
                )}
            >
                <DelimiterMenu value={delimiter} onChange={onDelimiterChange} />

                <span
                    aria-hidden="true"
                    className="text-muted-foreground shrink-0 font-mono text-sm"
                >
                    {character}
                </span>

                <PatternInput
                    id={inputId}
                    value={pattern}
                    spans={spans}
                    label={t("patternLabel")}
                    placeholder={t("patternPlaceholder")}
                    invalid={invalid}
                    onChange={onPatternChange}
                    onPasteLiteral={onPasteLiteral}
                />

                <span
                    aria-hidden="true"
                    className="text-muted-foreground shrink-0 font-mono text-sm"
                >
                    {character}
                </span>

                <FlagsMenu value={flags} onToggle={onToggleFlag} />

                <IconCopyButton
                    copied={copied}
                    onClick={onCopy}
                    aria-label={t("copyPattern")}
                    disabled={pattern.length === 0}
                    className="disabled:pointer-events-none disabled:opacity-40"
                />
            </div>
        </div>
    );
}
