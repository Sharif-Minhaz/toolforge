"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { summarizeReadings, type Reading, type ReadingTone } from "../domain/summary";
import type { DomainReport } from "../types";

/**
 * The report's opening statement: the hostname, and six readings under it.
 *
 * It takes the slot the radar just vacated, which is the whole idea — the
 * instrument sweeps, then settles into what it found. Each reading is one
 * figure with an instrument label above it, so the row can be read in one pass
 * without any of the seven panels below being opened.
 */

const TONE_TEXT: Record<ReadingTone, string> = {
    good: "text-[color-mix(in_oklch,var(--brand-emerald)_78%,var(--foreground))]",
    warn: "text-[color-mix(in_oklch,var(--brand-amber)_72%,var(--foreground))]",
    bad: "text-[color-mix(in_oklch,var(--brand-rose)_74%,var(--foreground))]",
    idle: "text-muted-foreground",
};

const TONE_RULE: Record<ReadingTone, string> = {
    good: "bg-[color-mix(in_oklch,var(--brand-emerald)_70%,transparent)]",
    warn: "bg-[color-mix(in_oklch,var(--brand-amber)_70%,transparent)]",
    bad: "bg-[color-mix(in_oklch,var(--brand-rose)_70%,transparent)]",
    idle: "bg-border",
};

export function SignalStrip({ report }: { report: DomainReport }) {
    const t = useTranslations("domainInspector.readings");
    const tGrades = useTranslations("domainInspector.grades");
    const tCommon = useTranslations("domainInspector.common");
    const format = useFormatter();

    const readings = summarizeReadings(report);

    /**
     * A reading is one of three shapes, and each needs different handling: a
     * count and a day figure both go through `Intl` so Bangla gets Bengali
     * numerals, while a registrar or an AS name is data and is shown verbatim.
     */
    function valueOf(reading: Reading): string {
        if (reading.unit === "days" && reading.amount !== null) {
            return reading.amount < 0
                ? t("daysAgo", { days: Math.abs(reading.amount) })
                : t("daysLeft", { days: reading.amount });
        }

        if (reading.unit === "count" && reading.amount !== null && reading.amount > 0) {
            return format.number(reading.amount);
        }

        if (reading.id === "headers" && reading.text !== null) {
            return tGrades(reading.text as "strong" | "partial" | "weak");
        }

        return reading.text ?? tCommon("absent");
    }

    return (
        <section
            aria-label={t("label")}
            className="bg-card ring-border/70 panel-sheen relative flex min-w-0 flex-col overflow-hidden rounded-2xl ring-1 ring-inset"
        >
            <header className="flex min-w-0 flex-col gap-1 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
                <p className="text-muted-foreground text-[0.625rem] leading-normal tracking-[0.16em] uppercase">
                    {t("label")}
                </p>
                {/*
                 * The mono face is the display face here. On a tool that reads
                 * DNS, the monospace hostname is the most characteristic thing
                 * on the page — a sans headline would be any dashboard's.
                 */}
                <h2 className="min-w-0 font-mono text-xl leading-[1.3] font-medium tracking-tight break-all sm:text-2xl">
                    {report.breakdown.unicode}
                </h2>
                {report.breakdown.punycoded && (
                    <p className="text-muted-foreground min-w-0 font-mono text-xs break-all">
                        {report.breakdown.hostname}
                    </p>
                )}
            </header>

            {/*
             * Three columns at the widest, never six. A registrar name and an
             * AS name are the two longest values here and both are proper
             * nouns — truncating them to "DreamHost, …" tells the reader
             * nothing they did not already know. Two rows of three costs one
             * row of height and lets each value show.
             *
             * Hairlines come from the grid's own gap showing the border colour
             * through, not from a border per cell: six bordered cells read as
             * six boxes, which is the density this strip exists to replace.
             */}
            <dl className="bg-border/60 border-border/70 grid grid-cols-2 gap-px border-t sm:grid-cols-3">
                {readings.map((reading) => (
                    <div
                        key={reading.id}
                        className="bg-card flex min-w-0 flex-col gap-1 px-5 py-3.5 sm:px-6"
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                "h-0.5 w-6 rounded-full transition-colors",
                                TONE_RULE[reading.tone],
                            )}
                        />
                        <dt className="text-muted-foreground text-[0.625rem] leading-normal tracking-[0.14em] uppercase">
                            {t(reading.id)}
                        </dt>
                        <dd
                            className={cn(
                                "min-w-0 truncate font-mono text-[0.9375rem] leading-[1.4] tabular-nums",
                                TONE_TEXT[reading.tone],
                            )}
                            title={reading.text ?? undefined}
                        >
                            {valueOf(reading)}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
