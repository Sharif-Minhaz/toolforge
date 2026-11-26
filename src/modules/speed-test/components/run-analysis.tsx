"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
    bufferbloatGrade,
    latencyIncrease,
    transferSeconds,
    verdictsByUseCase,
} from "../domain/analysis";
import { LARGE_DOWNLOAD_BYTES, LARGE_UPLOAD_BYTES } from "../domain/constants";
import type { BufferbloatGrade, SpeedRun, Verdict } from "../types";
import { useRateFormat } from "./use-rate-format";

/** Message keys cannot hold a `+`, so each grade names its own. */
const GRADE_KEYS: Readonly<Record<BufferbloatGrade, "aPlus" | "a" | "b" | "c" | "d" | "f">> = {
    "A+": "aPlus",
    A: "a",
    B: "b",
    C: "c",
    D: "d",
    F: "f",
};

const GRADE_TONES: Readonly<Record<BufferbloatGrade, string>> = {
    "A+": "bg-success/15 text-success",
    A: "bg-success/15 text-success",
    B: "bg-success/10 text-success",
    C: "bg-brand-amber/15 text-brand-amber",
    D: "bg-destructive/10 text-destructive",
    F: "bg-destructive/15 text-destructive",
};

const VERDICT_TONES: Readonly<Record<Verdict, string>> = {
    great: "bg-success/12 text-success",
    ok: "bg-brand-amber/15 text-brand-amber",
    poor: "bg-destructive/10 text-destructive",
};

const CARD =
    "bg-card ring-border/70 flex min-w-0 flex-col gap-2 rounded-lg p-3 ring-1 ring-inset sm:p-4";

/**
 * One run, read out: the lag-under-load grade, a verdict per use case with the
 * measurement that held it back, and the two transfers most people time.
 * Colour is never the only signal — every chip carries its word.
 */
export function RunAnalysis({ run }: { run: SpeedRun }) {
    const t = useTranslations("speedTest.workbench");
    const format = useRateFormat();
    const grade = bufferbloatGrade(run);
    const increase = latencyIncrease(run);

    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <section className={CARD}>
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm leading-[1.3] font-medium">{t("bloatTitle")}</h3>
                    {grade !== null && (
                        <span
                            className={cn(
                                "rounded-md px-2 py-0.5 font-mono text-sm font-semibold",
                                GRADE_TONES[grade],
                            )}
                        >
                            {t("bloatGrade", { grade })}
                        </span>
                    )}
                </div>
                {grade === null || increase === null ? (
                    <p className="text-muted-foreground text-xs leading-[1.5]">
                        {t("bloatUnavailable")}
                    </p>
                ) : (
                    <>
                        <p className="font-mono text-xs tabular-nums">
                            {t("bloatDetail", {
                                idle: format.ms(run.latencyMs),
                                busy: format.ms(run.loadedLatencyMs),
                                increase: format.ms(increase),
                            })}
                        </p>
                        <p className="text-muted-foreground text-xs leading-[1.5]">
                            {t(`bloatHints.${GRADE_KEYS[grade]}`)}
                        </p>
                    </>
                )}
            </section>

            <section className={CARD}>
                <h3 className="text-sm leading-[1.3] font-medium">{t("transfersTitle")}</h3>
                <dl className="flex flex-col gap-1.5 text-xs">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <dt className="text-muted-foreground">{t("downloadTime")}</dt>
                        <dd className="font-mono tabular-nums">
                            {format.duration(
                                transferSeconds(LARGE_DOWNLOAD_BYTES, run.downloadBps),
                            )}
                        </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <dt className="text-muted-foreground">{t("uploadTime")}</dt>
                        <dd className="font-mono tabular-nums">
                            {format.duration(transferSeconds(LARGE_UPLOAD_BYTES, run.uploadBps))}
                        </dd>
                    </div>
                </dl>
            </section>

            <section className={cn(CARD, "lg:col-span-2")}>
                <h3 className="text-sm leading-[1.3] font-medium">{t("useCasesTitle")}</h3>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {verdictsByUseCase(run).map((item) => (
                        <li
                            key={item.useCase}
                            className="flex min-w-0 items-start justify-between gap-3 py-1"
                        >
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-[0.8125rem] leading-[1.3]">
                                    {t(`useCases.${item.useCase}`)}
                                </span>
                                {item.limitedBy !== null && (
                                    <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t(`limitedBy.${item.limitedBy}`)}
                                    </span>
                                )}
                            </span>
                            <span
                                className={cn(
                                    "shrink-0 rounded-md px-2 py-0.5 text-xs leading-[1.3] font-medium",
                                    VERDICT_TONES[item.verdict],
                                )}
                            >
                                {t(`verdicts.${item.verdict}`)}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
