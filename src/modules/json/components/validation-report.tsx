"use client";

import { IconAlertTriangle, IconCircleCheck, IconPointFilled } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { JsonAdvisory, JsonRepair, JsonStats } from "../types";
import { JsonNotices } from "./notices";

const STAT_KEYS = [
    "objects",
    "arrays",
    "keys",
    "strings",
    "numbers",
    "booleans",
    "nulls",
    "depth",
] as const;

type Verdict = "valid" | "invalid" | "idle";

const VERDICT_STYLE: Record<Verdict, string> = {
    valid: "text-[var(--color-success)] ring-[color-mix(in_oklch,var(--color-success)_28%,transparent)] bg-[color-mix(in_oklch,var(--color-success)_8%,transparent)]",
    invalid: "text-destructive ring-destructive/30 bg-destructive/8",
    idle: "text-muted-foreground ring-border/70 bg-card/60",
};

const VERDICT_ICON = {
    valid: IconCircleCheck,
    invalid: IconAlertTriangle,
    idle: IconPointFilled,
};

type ValidationReportProps = {
    verdict: Verdict;
    /** Already-localised failure message, or `null` when the document parsed. */
    error: string | null;
    stats: JsonStats | null;
    advisories: readonly JsonAdvisory[];
    repairs: readonly JsonRepair[];
    /** True while the debounced input has yet to reach the parser. */
    pending: boolean;
};

/**
 * What Validate shows instead of an output box: a verdict, the shape of the
 * document, and anything worth mentioning about it.
 */
export function ValidationReport({
    verdict,
    error,
    stats,
    advisories,
    repairs,
    pending,
}: ValidationReportProps) {
    const t = useTranslations("json.report");
    const format = useFormatter();
    const Icon = VERDICT_ICON[verdict];

    const headline =
        verdict === "valid"
            ? t("verdictValid")
            : verdict === "invalid"
              ? t("verdictInvalid")
              : t("verdictIdle");

    return (
        <div
            className={cn(
                "flex flex-col gap-3 transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            <p
                role="status"
                className={cn(
                    "flex items-start gap-2.5 rounded-xl p-3 text-[0.8125rem] leading-6 ring-1 ring-inset",
                    VERDICT_STYLE[verdict],
                )}
            >
                <Icon className="mt-0.5 size-4 shrink-0" stroke={1.9} aria-hidden="true" />
                <span className="min-w-0">
                    <span className="font-medium">{headline}</span>
                    {error !== null && <span className="block">{error}</span>}
                </span>
            </p>

            {stats !== null && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-muted-foreground text-[0.6875rem] leading-[1.4] font-semibold tracking-[0.06em] uppercase">
                        {t("statsTitle")}
                    </h3>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {STAT_KEYS.map((key) => (
                            <div
                                key={key}
                                className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                            >
                                <dt className="text-muted-foreground truncate text-[0.6875rem] leading-[1.4]">
                                    {t(`stats.${key}`)}
                                </dt>
                                <dd className="font-mono text-base leading-[1.3] tabular-nums">
                                    {format.number(stats[key])}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            <JsonNotices advisories={advisories} repairs={repairs} />

            {verdict === "valid" && advisories.length === 0 && repairs.length === 0 && (
                <p className="text-muted-foreground text-[0.8125rem] leading-6">
                    {t("advisoriesNone")}
                </p>
            )}
        </div>
    );
}
