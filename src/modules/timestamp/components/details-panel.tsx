"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { getTimeZoneCity } from "@/modules/tools/domain/time-zones";
import type { CalendarFacts } from "../types";

type DetailsPanelProps = {
    facts: CalendarFacts;
    relative: string;
    /** Calendar facts belong to one zone; naming it stops them reading as absolute. */
    factsTimeZone: string;
    pending: boolean;
};

/**
 * The facts that need a calendar rather than a clock. Counts go through the
 * formatter so Bangla renders Bengali numerals; the ISO week date does not,
 * because it is a machine format.
 */
export function DetailsPanel({ facts, relative, factsTimeZone, pending }: DetailsPanelProps) {
    const t = useTranslations("timestamp.workbench");
    const format = useFormatter();

    const rows = [
        {
            key: "dayOfYear",
            label: t("details.dayOfYear"),
            value: t("details.dayOfYearValue", {
                day: format.number(facts.dayOfYear),
                total: format.number(facts.leapYear ? 366 : 365),
            }),
            mono: false,
        },
        { key: "isoWeek", label: t("details.isoWeek"), value: facts.isoWeekDate, mono: true },
        {
            key: "quarter",
            label: t("details.quarter"),
            value: t("details.quarterValue", { quarter: format.number(facts.quarter) }),
            mono: false,
        },
        {
            key: "daysInMonth",
            label: t("details.daysInMonth"),
            value: format.number(facts.daysInMonth),
            mono: false,
        },
        {
            key: "leapYear",
            label: t("details.leapYear"),
            value: facts.leapYear ? t("details.yes") : t("details.no"),
            mono: false,
        },
    ];

    return (
        <div
            className={cn(
                "flex flex-col gap-2 transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            {/* "in 3 days" is the one line here a person reads rather than
                looks up, so it leads instead of sitting in the grid as the
                first of six identically weighted tiles. */}
            <div className="rounded-xl bg-[color-mix(in_oklch,var(--tool-accent)_10%,transparent)] px-4 py-3 ring-1 ring-[color-mix(in_oklch,var(--tool-accent)_22%,transparent)] ring-inset">
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                    {t("details.relative")}
                </p>
                <p className="mt-0.5 text-lg leading-[1.4] font-medium">{relative}</p>
            </div>

            <dl className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((row) => (
                    <div
                        key={row.key}
                        className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset"
                    >
                        <dt className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                            {row.label}
                        </dt>
                        <dd
                            className={cn(
                                "truncate text-[0.8125rem] leading-[1.4]",
                                row.mono && "font-mono tabular-nums",
                            )}
                        >
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t("details.zoneNote", { zone: getTimeZoneCity(factsTimeZone) })}
            </p>
        </div>
    );
}
