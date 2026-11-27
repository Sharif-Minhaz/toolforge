"use client";

import { IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { saveFile } from "@/modules/tools/domain/file-saver";
import type { Comparison } from "../domain/compare";
import { MINOR_DIGITS } from "../domain/constants";
import { MONEY_SECTION_ORDER, MONEY_SECTIONS, type ZakatForm } from "../domain/form";
import { buildZakatReport, type ReportRow } from "../domain/report";
import { viewOf } from "../domain/rules";
import { usePurityLabel } from "./use-purity-label";
import type { BreakdownLine, MoneyKind, ZakatOutcome, ZakatResult } from "../types";

type ResultPanelProps = {
    outcome: ZakatOutcome;
    comparisons: readonly Comparison[];
    form: ZakatForm;
    blank: boolean;
    /** The result trails the form while typing settles; dim it rather than blank it. */
    stale: boolean;
    children?: ReactNode;
};

const MONEY_KINDS: ReadonlySet<string> = new Set<string>(
    MONEY_SECTION_ORDER.flatMap((section) => MONEY_SECTIONS[section]),
);

function isMoneyKind(kind: BreakdownLine["kind"]): kind is MoneyKind {
    return MONEY_KINDS.has(kind);
}

export function ResultPanel({
    outcome,
    comparisons,
    form,
    blank,
    stale,
    children,
}: ResultPanelProps) {
    const t = useTranslations("zakat.result");
    const tFields = useTranslations("zakat.fields");
    const tErrors = useTranslations("zakat.errors");
    const tViews = useTranslations("zakat.views");
    const tMetals = useTranslations("zakat.metals");
    const formatter = useFormatter();
    const purityLabel = usePurityLabel();

    const currency = form.currency;
    const money = (decimal: string, digits = MINOR_DIGITS[currency]) =>
        formatter.number(Number(decimal), {
            style: "currency",
            currency,
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });

    if (!outcome.ok) {
        return (
            <StatusStrip
                tone="error"
                message={
                    outcome.lineId === undefined
                        ? tErrors(outcome.reason, { code: outcome.code ?? "" })
                        : t("fixField")
                }
            />
        );
    }

    const result: ZakatResult = outcome;

    function lineLabel(line: BreakdownLine): string {
        if (isMoneyKind(line.kind)) {
            return tFields(`${line.kind}.label`);
        }

        if (line.kind === "gold" || line.kind === "silver") {
            const item = form.metals.find((metal) => metal.id === line.id);
            const name = item?.label.trim() ?? "";
            const purity = item === undefined ? "" : purityLabel(line.kind, item.karat);

            return t("metalLine", {
                metal: tMetals(`names.${line.kind}`),
                purity,
                name: name.length > 0 ? name : "—",
            });
        }

        return line.kind === "crypto" ? line.label : t("longTermShares");
    }

    const rate = formatter.number(Number(result.rate), {
        style: "percent",
        maximumFractionDigits: 3,
    });
    const view = viewOf(form.rules);
    const weighed = result.test === "goldWeight" || result.test === "silverWeight";
    const testGrams = Number(
        result.test === "goldWeight" || result.test === "goldValue"
            ? result.nisab.goldGrams
            : result.nisab.silverGrams,
    );
    const progress = weighed
        ? Number(result.nisab.countedGrams ?? "0") / testGrams
        : Number(result.net) / Math.max(Number.MIN_VALUE, Number(result.nisab.applied));
    const nisabText = weighed
        ? t(`nisab.${result.test === "goldWeight" ? "goldWeight" : "silverWeight"}`, {
              grams: formatter.number(testGrams),
              counted: formatter.number(Number(result.nisab.countedGrams ?? "0"), {
                  maximumFractionDigits: 3,
              }),
          })
        : t(`nisab.${result.test === "goldValue" ? "goldValue" : "silverValue"}`, {
              grams: formatter.number(testGrams),
              value: money(result.nisab.applied),
          });

    const goldGrams = Number(result.metalZakatGrams.gold);
    const advanceRows: ReportRow[] =
        Number(result.advancePaid) > 0 ? [[t("figures.advance"), money(result.advancePaid)]] : [];
    const figures: ReportRow[] = [
        [t("figures.assets"), money(result.totalAssets)],
        [t("figures.deductions"), money(result.totalDeductions)],
        [t("figures.net"), money(result.net)],
        [t("figures.rate"), rate],
        [t("figures.zakat"), money(result.zakat)],
        ...advanceRows,
        [t("figures.payable"), money(result.payable)],
    ];

    function handleDownload() {
        const generated = new Date();
        const content = buildZakatReport({
            title: t("report.title"),
            subtitle: [
                t("report.generated", {
                    date: formatter.dateTime(generated, { dateStyle: "long", timeStyle: "short" }),
                }),
                t("report.view", { view: tViews(view) }),
            ],
            sections: [
                {
                    heading: t("report.verdict"),
                    rows: [],
                    notes: [t(`verdicts.${result.verdict}`), nisabText],
                },
                { heading: t("report.figures"), rows: figures },
                {
                    heading: t("report.prices"),
                    rows: [
                        [t("report.goldPrice"), money(result.pricePerGram.gold)],
                        [t("report.silverPrice"), money(result.pricePerGram.silver)],
                    ],
                },
                {
                    heading: t("breakdown.title"),
                    rows: result.lines.map((line) => [
                        lineLabel(line),
                        `${money(line.counted)}  (${t(`treatments.${line.treatment}`)})`,
                    ]),
                },
                {
                    heading: t("compare.title"),
                    rows: comparisons.map((row) => [
                        t(`compare.variants.${row.variant}`),
                        row.verdict === "due"
                            ? money(row.payable)
                            : t(`verdictsShort.${row.verdict}`),
                    ]),
                },
                {
                    heading: t("report.notes"),
                    rows: [],
                    notes: [
                        ...(Number(result.interestToPurify) > 0
                            ? [t("interest", { amount: money(result.interestToPurify) })]
                            : []),
                        t("report.disclaimer"),
                    ],
                },
            ],
            footer: [t("report.footer")],
        });
        const filename = `zakat-${generated.toISOString().slice(0, 10)}.txt`;

        try {
            saveFile({ filename, mimeType: "text/plain;charset=utf-8", content });
            toast.success(t("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "zakat.report_download_failed", { error: describeError(caught) });
            toast.error(t("downloadFailed"));
        }
    }

    return (
        <div
            className={cn(
                "flex flex-col gap-4 transition-opacity duration-200",
                stale && "opacity-55",
            )}
        >
            {blank ? (
                <div className="flex flex-col gap-1 py-2">
                    <p className="text-sm font-medium">{t("empty.title")}</p>
                    <p className="text-muted-foreground text-[0.75rem] leading-5">
                        {t("empty.body")}
                    </p>
                </div>
            ) : (
                <>
                    <div aria-live="polite" className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs font-medium">
                            {t(`verdicts.${result.verdict}`)}
                        </span>
                        <span
                            className={cn(
                                "font-mono text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl",
                                result.verdict !== "due" && "text-muted-foreground",
                            )}
                        >
                            {money(result.payable)}
                        </span>
                        {result.verdict === "due" && goldGrams > 0 && (
                            <span className="text-muted-foreground text-[0.75rem]">
                                {t("inGold", {
                                    grams: formatter.number(goldGrams, {
                                        maximumFractionDigits: 4,
                                    }),
                                })}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div
                            role="progressbar"
                            aria-label={t("nisab.progressLabel")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(Math.min(1, progress) * 100)}
                            className="bg-muted h-1.5 overflow-hidden rounded-full"
                        >
                            <div
                                className={cn(
                                    "h-full rounded-full transition-[width] duration-300",
                                    progress >= 1 ? "bg-success" : "bg-primary",
                                )}
                                style={{ width: `${Math.min(1, progress) * 100}%` }}
                            />
                        </div>
                        <p className="text-muted-foreground text-[0.75rem] leading-5">
                            {nisabText}
                        </p>
                    </div>

                    <dl className="flex flex-col gap-1 text-[0.8125rem]">
                        {figures.map(([label, value], index) => (
                            <div
                                key={label}
                                className={cn(
                                    "flex items-baseline justify-between gap-3",
                                    index === figures.length - 1 &&
                                        "border-border/70 border-t pt-1.5 font-semibold",
                                )}
                            >
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="font-mono tabular-nums">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {Number(result.interestToPurify) > 0 && (
                        <StatusStrip
                            tone="warning"
                            message={t("interest", { amount: money(result.interestToPurify) })}
                        />
                    )}

                    <div>
                        <Button size="sm" onClick={handleDownload}>
                            <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("download")}
                        </Button>
                    </div>
                </>
            )}

            {!blank && result.lines.length > 0 && (
                <details className="group/breakdown" open>
                    <summary className="cursor-pointer text-sm font-medium [&::-webkit-details-marker]:hidden">
                        {t("breakdown.title")}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1.5">
                        {result.lines.map((line) => (
                            <li
                                key={`${line.group}-${line.id}`}
                                className="ring-border/60 flex flex-col gap-0.5 rounded-lg px-3 py-2 ring-1 ring-inset"
                            >
                                <span className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                                    <span className="min-w-0 truncate">{lineLabel(line)}</span>
                                    <span
                                        className={cn(
                                            "shrink-0 font-mono tabular-nums",
                                            Number(line.counted) === 0 &&
                                                "text-muted-foreground line-through",
                                        )}
                                    >
                                        {line.group === "liability" && Number(line.counted) > 0
                                            ? "−"
                                            : ""}
                                        {money(line.value)}
                                    </span>
                                </span>
                                <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t(`treatments.${line.treatment}`)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {!blank && comparisons.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">{t("compare.title")}</h3>
                    <p className="text-muted-foreground text-[0.75rem] leading-5">
                        {t("compare.hint")}
                    </p>
                    <dl className="flex flex-col gap-1 text-[0.8125rem]">
                        {comparisons.map((row) => (
                            <div
                                key={row.variant}
                                className="flex items-baseline justify-between gap-3"
                            >
                                <dt className="text-muted-foreground">
                                    {t(`compare.variants.${row.variant}`)}
                                </dt>
                                <dd className="font-mono tabular-nums">
                                    {row.verdict === "due"
                                        ? money(row.payable)
                                        : t(`verdictsShort.${row.verdict}`)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            {children}
        </div>
    );
}
