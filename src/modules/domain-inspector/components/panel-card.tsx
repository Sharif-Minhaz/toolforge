"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ReadingTone } from "../domain/summary";
import type { PanelFailureReason, PanelResult } from "../types";

/**
 * The primitives every result panel is built from.
 *
 * Two decisions here are the difference between a readable panel and a wall:
 *
 * - **No status colour on the panel itself.** The strip at the top of the
 *   report is the status layer; repeating it as a coloured rail down every card
 *   put a traffic light on a page that already had one, and a grid of red and
 *   green edges reads as alarm rather than information. Tone survives only
 *   inside chips, where it reinforces a word instead of replacing one.
 * - **Values are left-aligned on a fixed label column.** Right-aligned values
 *   give every row a different left edge, so a column of hostnames has no line
 *   to scan down — and `break-all` on top of that snaps words mid-token.
 */

type PanelCardProps = {
    title: ReactNode;
    icon: ReactNode;
    /** A short qualifier on the right of the header — a resolver, a count. */
    meta?: ReactNode;
    children: ReactNode;
    className?: string;
};

export function PanelCard({ title, icon, meta, children, className }: PanelCardProps) {
    return (
        <section
            className={cn(
                "bg-card ring-border/70 flex min-w-0 flex-col overflow-hidden rounded-2xl ring-1 ring-inset",
                className,
            )}
        >
            <header className="border-border/60 flex min-w-0 items-center gap-2.5 border-b px-5 py-3.5">
                {/*
                 * The accent lives here and nowhere else: one tinted glyph per
                 * panel is enough to say which tool you are in.
                 */}
                <span className="shrink-0 text-[color-mix(in_oklch,var(--tool-accent)_70%,var(--muted-foreground))]">
                    {icon}
                </span>
                <h3 className="min-w-0 flex-1 text-[0.8125rem] leading-[1.4] font-medium tracking-[0.02em]">
                    {title}
                </h3>
                {meta !== undefined && (
                    <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem]">
                        {meta}
                    </span>
                )}
            </header>

            <div className="min-w-0 px-5 py-1">{children}</div>
        </section>
    );
}

/** The reason a panel has nothing to show, kept to one quiet line. */
export function PanelUnavailable({ reason }: { reason: PanelFailureReason }) {
    const t = useTranslations("domainInspector.panelErrors");

    return (
        <p className="text-muted-foreground py-3 text-[0.8125rem] leading-normal">{t(reason)}</p>
    );
}

export function PanelBody<T>({
    result,
    children,
}: {
    result: PanelResult<T>;
    children: (data: T) => ReactNode;
}) {
    return result.ok ? <>{children(result.data)}</> : <PanelUnavailable reason={result.reason} />;
}

/**
 * Wrap only where a word cannot fit, rather than at any character. A hostname
 * or a fingerprint still breaks; "DreamHost, LLC" stops breaking after "Dream".
 */
const WRAP = "wrap-anywhere";

const LABEL = "text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase";

type RowProps = {
    label: ReactNode;
    children: ReactNode;
    /** Full-width value on its own line — for a fingerprint or a SAN list. */
    stacked?: boolean;
};

export function Row({ label, children, stacked }: RowProps) {
    if (stacked === true) {
        return (
            <div className="border-border/50 flex min-w-0 flex-col gap-1 border-b py-2.5 last:border-b-0">
                <dt className={LABEL}>{label}</dt>
                <dd className={cn("min-w-0 font-mono text-[0.8125rem] leading-relaxed", WRAP)}>
                    {children}
                </dd>
            </div>
        );
    }

    return (
        <div className="border-border/50 grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-b py-2.5 last:border-b-0">
            <dt className={cn(LABEL, "pt-px")}>{label}</dt>
            <dd className={cn("min-w-0 font-mono text-[0.8125rem] leading-relaxed", WRAP)}>
                {children}
            </dd>
        </div>
    );
}

export function Rows({ children, label }: { children: ReactNode; label: string }) {
    return (
        <dl aria-label={label} className="min-w-0">
            {children}
        </dl>
    );
}

/** A heading for a run of rows, so a long panel reads as two or three parts. */
export function GroupLabel({ children }: { children: ReactNode }) {
    return <p className={cn(LABEL, "pt-3 pb-1")}>{children}</p>;
}

export type ChipTone = ReadingTone | "neutral";

const CHIP_TONES: Record<ChipTone, string> = {
    good: "text-foreground ring-[color-mix(in_oklch,var(--brand-emerald)_40%,transparent)] bg-[color-mix(in_oklch,var(--brand-emerald)_9%,transparent)]",
    warn: "text-foreground ring-[color-mix(in_oklch,var(--brand-amber)_40%,transparent)] bg-[color-mix(in_oklch,var(--brand-amber)_9%,transparent)]",
    bad: "text-foreground ring-[color-mix(in_oklch,var(--brand-rose)_40%,transparent)] bg-[color-mix(in_oklch,var(--brand-rose)_9%,transparent)]",
    idle: "text-muted-foreground ring-border/70 bg-transparent",
    neutral: "text-muted-foreground ring-border/70 bg-transparent",
};

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] leading-normal ring-1 ring-inset",
                CHIP_TONES[tone],
            )}
        >
            {children}
        </span>
    );
}
