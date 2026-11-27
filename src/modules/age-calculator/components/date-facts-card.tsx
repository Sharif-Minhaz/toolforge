"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { DateFacts } from "../types";
import type { CalendarLabels } from "./use-calendar-labels";

type DateFactsCardProps = {
    title: string;
    facts: DateFacts;
    labels: CalendarLabels;
    copyLabel: string;
    copied: boolean;
    dimmed: boolean;
    onCopy: (text: string) => void;
};

/** The three lines a calendar file needs for `facts`, joined for the clipboard. */
export function factsAsText(facts: DateFacts, labels: CalendarLabels): string {
    return [
        labels.gregorian(facts.gregorian),
        labels.bangla(facts.bangla),
        labels.hijri(facts.hijri),
    ].join("\n");
}

/**
 * One day named in all three calendars. The Bangla line says which revision
 * of the calendar produced it, because a certificate from before 2019 may
 * name the same day differently — and says so louder before 1394 BS, when no
 * fixed calendar was official at all.
 */
export function DateFactsCard({
    title,
    facts,
    labels,
    copyLabel,
    copied,
    dimmed,
    onCopy,
}: DateFactsCardProps) {
    const t = useTranslations("ageCalculator.workbench");

    const rows = [
        {
            key: "gregorian",
            label: t("calendars.gregorian"),
            value: labels.gregorian(facts.gregorian),
        },
        {
            key: "bangla",
            label: t("calendars.bangla"),
            value: labels.bangla(facts.bangla),
            note: t(`rules.${facts.bangla.rule}`),
        },
        { key: "hijri", label: t("calendars.hijri"), value: labels.hijri(facts.hijri) },
    ] as const;

    return (
        <section
            className={cn(
                "bg-card ring-border/70 flex min-w-0 flex-col gap-3 rounded-lg p-3 ring-1 ring-inset sm:p-4",
                "transition-opacity duration-200",
                dimmed && "opacity-55",
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">{title}</h3>
                <IconCopyButton
                    copied={copied}
                    onClick={() => onCopy(factsAsText(facts, labels))}
                    aria-label={copyLabel}
                />
            </div>

            <dl className="flex flex-col gap-2.5">
                {rows.map((row) => (
                    <div key={row.key} className="flex min-w-0 flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                            {row.label}
                        </dt>
                        <dd className="text-[0.9375rem] leading-[1.5] font-medium break-words">
                            {/* The বঙ্গাব্দ date is Bangla script on every page,
                                so a screen reader needs to be told to read it so. */}
                            <span lang={row.key === "bangla" ? "bn" : undefined}>{row.value}</span>
                            {"note" in row && (
                                <span className="text-muted-foreground block text-[0.6875rem] leading-[1.4] font-normal">
                                    {row.note}
                                </span>
                            )}
                        </dd>
                    </div>
                ))}
            </dl>

            {facts.bangla.beforeReform && (
                <p className="text-muted-foreground flex items-start gap-1.5 text-[0.6875rem] leading-[1.4]">
                    <IconInfoCircle
                        className="mt-px size-3.5 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    {t("beforeReform")}
                </p>
            )}
        </section>
    );
}
