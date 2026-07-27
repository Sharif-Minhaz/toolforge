"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { cn } from "@/lib/utils";
import type { JwtSegmentName, JwtSegments } from "../types";

const SEGMENT_ORDER: readonly JwtSegmentName[] = ["header", "payload", "signature"];

/** One hue per part, so the same three colours read consistently everywhere. */
const SEGMENT_TEXT: Record<JwtSegmentName, string> = {
    header: "text-brand-rose",
    payload: "text-brand-violet",
    signature: "text-brand-cyan",
};

const SEGMENT_DOT: Record<JwtSegmentName, string> = {
    header: "bg-brand-rose",
    payload: "bg-brand-violet",
    signature: "bg-brand-cyan",
};

type TokenSegmentsProps = {
    segments: JwtSegments;
    className?: string;
};

/** The compact token, coloured by part. Read-only: it is generated, not typed. */
export function TokenSegments({ segments, className }: TokenSegmentsProps) {
    return (
        <p className={cn("font-mono text-[0.8125rem] leading-6 break-all select-all", className)}>
            {SEGMENT_ORDER.map((name, index) => (
                <Fragment key={name}>
                    {index > 0 && <span className="text-muted-foreground">.</span>}
                    <span className={SEGMENT_TEXT[name]}>{segments[name]}</span>
                </Fragment>
            ))}
        </p>
    );
}

type SegmentChipsProps = {
    segments: JwtSegments;
    className?: string;
};

/**
 * Names the three parts and how long each is, in the same colours the token
 * uses — the legend for a pasted token, which stays a plain editable textarea.
 */
export function SegmentChips({ segments, className }: SegmentChipsProps) {
    const t = useTranslations("jwt.workbench");

    return (
        <ul className={cn("flex flex-wrap gap-1.5", className)}>
            {SEGMENT_ORDER.map((name) => (
                <li
                    key={name}
                    className="bg-card/70 ring-border/70 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.6875rem] ring-1 ring-inset"
                >
                    <span
                        aria-hidden="true"
                        className={cn("size-1.5 shrink-0 rounded-full", SEGMENT_DOT[name])}
                    />
                    <span className="leading-[1.3] font-medium">{t(`segments.${name}`)}</span>
                    <span className="text-muted-foreground font-mono tabular-nums">
                        {t("segmentLength", { count: segments[name].length })}
                    </span>
                </li>
            ))}
        </ul>
    );
}
