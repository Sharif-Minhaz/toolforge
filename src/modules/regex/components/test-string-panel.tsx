"use client";

import { IconDownload, IconEraser, IconLink } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRef, type UIEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { MAX_TEST_STRING_LENGTH } from "../domain/constants";
import { toMatchSegments } from "../domain/segments";
import type { RegexMatch } from "../types";
import { FIELD_INPUT, FIELD_OVERLAY, FIELD_PADDING, FIELD_TEXT } from "./field-styles";

type TestStringPanelProps = {
    inputId: string;
    value: string;
    matches: readonly RegexMatch[];
    /** Dims the paint while a newer request is still in flight. */
    pending: boolean;
    /** True when nothing ran, so there is no report worth exporting. */
    blocked: boolean;
    onChange: (value: string) => void;
    onClear: () => void;
    onShare: () => void;
    onDownload: () => void;
};

export function TestStringPanel({
    inputId,
    value,
    matches,
    pending,
    blocked,
    onChange,
    onClear,
    onShare,
    onDownload,
}: TestStringPanelProps) {
    const t = useTranslations("regex.workbench");
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const segments = toMatchSegments(value.length, matches);
    // Not capped: a sample is pasted whole and a trimmed one matches
    // differently, which is a wrong answer rather than a refused one.
    const reading = useInputLimit(value.length, MAX_TEST_STRING_LENGTH);

    function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
        const overlay = overlayRef.current;

        if (overlay !== null) {
            overlay.scrollTop = event.currentTarget.scrollTop;
            overlay.scrollLeft = event.currentTarget.scrollLeft;
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    {t("testStringLabel")}
                </Label>
                <div className="flex items-center gap-1.5">
                    <InputLimitMeter reading={reading} className="mr-1" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={value.length === 0}
                        className="text-muted-foreground hover:text-foreground h-7"
                    >
                        <IconEraser className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("clear")}
                    </Button>
                    {/* Copies a link that reopens the tool exactly as it stands
                        — pattern, flags, delimiter, mode, and input. */}
                    <Button variant="outline" size="sm" onClick={onShare}>
                        <IconLink className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("share")}
                    </Button>
                    {/* One export for the whole tool, in every mode: a JSON
                        report of the matches and their capture groups. */}
                    <Button variant="outline" size="sm" onClick={onDownload} disabled={blocked}>
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>
            </div>

            <div
                className={cn(
                    "bg-card/60 ring-border/70 relative min-w-0 rounded-xl ring-1 ring-inset",
                    "focus-within:ring-ring transition-shadow duration-200 focus-within:ring-2",
                )}
            >
                <div
                    ref={overlayRef}
                    aria-hidden="true"
                    className={cn(
                        FIELD_OVERLAY,
                        FIELD_TEXT,
                        FIELD_PADDING,
                        "wrap-break-word whitespace-pre-wrap transition-opacity duration-200",
                        pending && "opacity-45",
                    )}
                >
                    {/* Transparent throughout: the textarea above supplies the
                        visible text, and these runs exist only to reserve the
                        exact space each highlight has to sit behind. */}
                    {segments.map((segment) =>
                        segment.matchIndex === null ? (
                            <span key={segment.start} className="text-transparent">
                                {value.slice(segment.start, segment.end)}
                            </span>
                        ) : (
                            <mark
                                key={segment.start}
                                className={cn(
                                    "rounded-[0.2rem] text-transparent",
                                    // Alternating strength, so two matches that
                                    // touch do not read as one long one.
                                    segment.matchIndex % 2 === 0
                                        ? "bg-[color-mix(in_oklch,var(--tool-accent)_30%,transparent)]"
                                        : "bg-[color-mix(in_oklch,var(--tool-accent)_18%,transparent)]",
                                )}
                            >
                                {value.slice(segment.start, segment.end)}
                            </mark>
                        ),
                    )}
                    {/* A textarea keeps a trailing newline as an empty last line;
                        a div collapses it, which shifts every highlight up by a
                        row once the input ends in a break. */}
                    {"\n"}
                </div>

                <textarea
                    id={inputId}
                    value={value}
                    placeholder={t("testStringPlaceholder")}
                    spellCheck={false}
                    onChange={(event) => onChange(event.target.value)}
                    onScroll={handleScroll}
                    className={cn(
                        FIELD_INPUT,
                        FIELD_TEXT,
                        FIELD_PADDING,
                        "placeholder:text-muted-foreground/70 selection:bg-primary/25",
                        "h-56 resize-y wrap-break-word whitespace-pre-wrap lg:h-72",
                    )}
                />
            </div>
        </div>
    );
}
