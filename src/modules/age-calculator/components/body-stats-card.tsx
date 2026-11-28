"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { ReadingTile } from "@/modules/tools/components/reading-tile";
import type { BodyStats, CivilDate } from "../types";
import type { CalendarLabels } from "./use-calendar-labels";

type BodyStatsCardProps = {
    body: BodyStats;
    reference: CivilDate;
    labels: CalendarLabels;
    dimmed: boolean;
};

/**
 * The days lived, re-read as published adult daily averages. Every rate and
 * its source is in `domain/body-stats.ts`; the note under the tiles says they
 * are estimates and points at the FAQ that names the sources.
 */
export function BodyStatsCard({ body, reference, labels, dimmed }: BodyStatsCardProps) {
    const t = useTranslations("ageCalculator.workbench.body");
    const formatter = useFormatter();

    // Masses and lengths to one decimal, so a newborn's first days are not all 0.
    const decimal = (value: number) => formatter.number(value, { maximumFractionDigits: 1 });
    const mmToCm = (mm: number) => decimal(mm / 10);

    return (
        <section
            className={cn(
                "bg-card ring-border/70 flex min-w-0 flex-col gap-3 rounded-lg p-3 ring-1 ring-inset sm:p-4",
                "transition-opacity duration-200",
                dimmed && "opacity-55",
            )}
        >
            <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                {t("title", { date: labels.gregorianShort(reference) })}
            </h3>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ReadingTile label={t("heartbeats")} value={labels.number(body.heartbeats)} />
                <ReadingTile
                    label={t("blood")}
                    value={t("litres", { value: labels.number(body.bloodLitres) })}
                />
                <ReadingTile label={t("breaths")} value={labels.number(body.breaths)} />
                <ReadingTile
                    label={t("oxygen")}
                    value={t("kilograms", { value: decimal(body.oxygenKg) })}
                />
                <ReadingTile
                    label={t("carbonDioxide")}
                    value={t("kilograms", { value: decimal(body.carbonDioxideKg) })}
                />
                <ReadingTile
                    label={t("hairsShed")}
                    value={t("range", {
                        low: labels.number(body.hairsShed.low),
                        high: labels.number(body.hairsShed.high),
                    })}
                />
                <ReadingTile
                    label={t("hairGrown")}
                    value={t("centimetres", { value: mmToCm(body.hairGrownMm) })}
                />
                <ReadingTile
                    label={t("nailGrown")}
                    value={t("centimetres", { value: mmToCm(body.nailGrownMm) })}
                />
            </dl>
            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t("note", { days: labels.number(body.days) })}
            </p>
        </section>
    );
}
