"use client";

import { IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { CivilDate, Eligibility, LimitCheck } from "../types";
import type { CalendarLabels } from "./use-calendar-labels";

type EligibilityReportProps = {
    eligibility: Eligibility;
    reference: CivilDate;
    relaxation: CivilDate | null;
    labels: CalendarLabels;
    dimmed: boolean;
};

/**
 * The verdict, then each limit it rests on with the date of birth on its
 * edge. Pass and fail carry an icon and a word as well as a colour, so the
 * answer does not depend on telling green from red.
 */
export function EligibilityReport({
    eligibility,
    reference,
    relaxation,
    labels,
    dimmed,
}: EligibilityReportProps) {
    const t = useTranslations("ageCalculator.workbench.eligibility");

    const verdict = !eligibility.eligible
        ? t("ineligible")
        : eligibility.passedByRelaxation
          ? t("eligibleByRelaxation")
          : t("eligible");

    function line(check: LimitCheck, side: "min" | "max", on: CivilDate): string {
        const values = {
            years: check.years,
            date: labels.gregorianShort(on),
            born: labels.gregorianShort(check.born),
        };

        if (side === "min") {
            return check.passes ? t("minPass", values) : t("minFail", values);
        }

        return check.passes ? t("maxPass", values) : t("maxFail", values);
    }

    const checks = [
        eligibility.min === null
            ? null
            : { key: "min", check: eligibility.min, text: line(eligibility.min, "min", reference) },
        eligibility.max === null
            ? null
            : { key: "max", check: eligibility.max, text: line(eligibility.max, "max", reference) },
        eligibility.relaxedMax === null || relaxation === null
            ? null
            : {
                  key: "relaxed",
                  check: eligibility.relaxedMax,
                  text: line(eligibility.relaxedMax, "max", relaxation),
              },
    ].filter((entry) => entry !== null);

    const maxYears = eligibility.max?.years;

    return (
        <section
            className={cn(
                "bg-card ring-border/70 flex min-w-0 flex-col gap-3 rounded-lg p-3 ring-1 ring-inset sm:p-4",
                "transition-opacity duration-200",
                dimmed && "opacity-55",
            )}
        >
            <p
                className={cn(
                    "flex items-center gap-2 text-[0.9375rem] leading-[1.4] font-semibold",
                    eligibility.eligible ? "text-[var(--color-success)]" : "text-destructive",
                )}
            >
                {eligibility.eligible ? (
                    <IconCircleCheck className="size-5 shrink-0" stroke={1.9} aria-hidden="true" />
                ) : (
                    <IconCircleX className="size-5 shrink-0" stroke={1.9} aria-hidden="true" />
                )}
                {verdict}
            </p>

            <ul className="flex flex-col gap-1.5">
                {checks.map(({ key, check, text }) => (
                    <li key={key} className="flex items-start gap-2 text-[0.8125rem] leading-[1.5]">
                        {check.passes ? (
                            <IconCircleCheck
                                className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]"
                                stroke={1.9}
                                aria-hidden="true"
                            />
                        ) : (
                            <IconCircleX
                                className="text-destructive mt-0.5 size-4 shrink-0"
                                stroke={1.9}
                                aria-hidden="true"
                            />
                        )}
                        <span className="min-w-0">{text}</span>
                    </li>
                ))}
            </ul>

            {maxYears !== undefined && (
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t("edgeRule", { years: maxYears })}
                </p>
            )}
        </section>
    );
}
