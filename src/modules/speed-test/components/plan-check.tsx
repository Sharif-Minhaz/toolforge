"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { comparePlan, parsePlanMbps } from "../domain/analysis";
import { MAX_PLAN_INPUT_LENGTH } from "../domain/constants";
import type { SpeedRun } from "../types";

type PlanCheckProps = {
    plan: string;
    run: SpeedRun | null;
    onPlanChange: (plan: string) => void;
};

/**
 * The measured download against the figure on the bill. The plan is a short
 * identity field — a number off a bill — so it is capped, and it is checked
 * as typed with no debounce: there is nothing expensive to wait for.
 */
export function PlanCheck({ plan, run, onPlanChange }: PlanCheckProps) {
    const t = useTranslations("speedTest.workbench");
    const formatter = useFormatter();
    const inputId = useId();
    const hintId = useId();

    const mbps = parsePlanMbps(plan);
    const invalid = plan.trim().length > 0 && mbps === null;
    const comparison = mbps !== null && run !== null ? comparePlan(run.downloadBps, mbps) : null;

    return (
        <section className="bg-card ring-border/70 flex min-w-0 flex-col gap-2 rounded-lg p-3 ring-1 ring-inset sm:p-4">
            <h3 className="text-sm leading-[1.3] font-medium">{t("planTitle")}</h3>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    {t("planLabel")}
                </Label>
                <Input
                    id={inputId}
                    value={plan}
                    onChange={(event) => onPlanChange(event.target.value)}
                    placeholder={t("planPlaceholder")}
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={MAX_PLAN_INPUT_LENGTH}
                    aria-invalid={invalid}
                    aria-describedby={hintId}
                    className="h-9 max-w-40 font-mono tabular-nums"
                />
                <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {invalid ? t("planInvalid") : t("planHint")}
                </p>
            </div>
            {mbps !== null && comparison === null && (
                <p className="text-muted-foreground text-xs">{t("planNeedsRun")}</p>
            )}
            {mbps !== null && comparison !== null && (
                <div className="flex flex-col gap-1">
                    <p className="text-sm leading-[1.5] font-medium">
                        {t("planResult", {
                            share: formatter.number(comparison.share, {
                                style: "percent",
                                maximumFractionDigits: 0,
                            }),
                            plan: formatter.number(mbps),
                        })}
                    </p>
                    <p className="text-muted-foreground text-xs leading-[1.5]">
                        {t(`planVerdicts.${comparison.verdict}`)}
                    </p>
                </div>
            )}
        </section>
    );
}
