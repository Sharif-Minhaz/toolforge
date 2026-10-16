"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { ReportText } from "../domain/report";
import type { MouseButton } from "../types";

type ReportContext = {
    generated: Date;
    userAgent: string;
    faultWindowMs: number;
    durationMs: number;
    /** True when the fault list stopped short of every fault counted. */
    truncated: boolean;
};

/**
 * The report's words in the reader's language. The report layout itself is
 * `domain/report.ts`; this only fills it in.
 */
export function useReportText(): (context: ReportContext) => ReportText {
    const t = useTranslations("mouseTester.report");
    const tButtons = useTranslations("mouseTester.buttons");
    const tVerdicts = useTranslations("mouseTester.verdicts");
    const tFaults = useTranslations("mouseTester.faults");
    const tDiagnosis = useTranslations("mouseTester.diagnosis");
    const formatter = useFormatter();

    const ms = (value: number) =>
        t("ms", { value: formatter.number(value, { maximumFractionDigits: 1 }) });

    return (context) => ({
        title: t("title"),
        summary: [
            // ISO 8601 in UTC: a support desk in another zone reads the same
            // instant, and nothing about the reader's clock leaks into it.
            t("generated", { date: context.generated.toISOString() }),
            t("browser", { agent: context.userAgent }),
            t("duration", {
                seconds: formatter.number(context.durationMs / 1000, { maximumFractionDigits: 1 }),
            }),
            t("window", { window: ms(context.faultWindowMs) }),
        ],
        controlsHeading: t("controlsHeading"),
        columns: [
            tDiagnosis("colControl"),
            tDiagnosis("colUses"),
            tDiagnosis("colFaults"),
            tDiagnosis("colVerdict"),
        ],
        control: (control) =>
            control === "wheel" ? tDiagnosis("wheel") : tButtons(control satisfies MouseButton),
        verdict: (verdict) => tVerdicts(verdict),
        count: (value) => formatter.number(value),
        hold: (result) => t("hold", { result: tDiagnosis(`hold.${result}`) }),
        polling: (summary) =>
            summary === null
                ? t("pollingNone")
                : t("polling", {
                      median: formatter.number(Math.round(summary.medianHz)),
                      jitter: formatter.number(Math.round(summary.jitterPercent)),
                      samples: formatter.number(summary.samples),
                  }),
        overall: (verdict) => t("overall", { verdict: tVerdicts(verdict) }),
        faultsHeading: t("faultsHeading"),
        noFaults: t("noFaults"),
        fault: (fault) =>
            t("fault", {
                at: formatter.number(fault.at / 1000, {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                }),
                kind: tFaults(fault.kind),
                control: fault.control === "wheel" ? tDiagnosis("wheel") : tButtons(fault.control),
                gap: ms(fault.gap),
            }),
        truncated: context.truncated ? t("truncated") : null,
        dpiHeading: t("dpiHeading"),
        dpiNone: t("dpiNone"),
        dpiStage: (stage) =>
            [
                t("dpiStage", {
                    stage: formatter.number(stage.stage),
                    dpi: formatter.number(Math.round(stage.dpi)),
                    swipes: stage.swipes,
                }),
                ...(stage.ratio === null
                    ? []
                    : [
                          t("dpiRatio", {
                              ratio: formatter.number(stage.ratio, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                              }),
                          }),
                      ]),
                ...(stage.unchanged ? [t("dpiUnchanged")] : []),
            ].join(", "),
    });
}
