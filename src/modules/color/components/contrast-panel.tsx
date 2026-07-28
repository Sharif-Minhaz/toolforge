"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ContrastCheck, ContrastReport } from "../types";

type ContrastPanelProps = {
    report: ContrastReport;
    /** The picked colour as a CSS value, used as each sample's background. */
    background: string;
};

const LEVEL_TONE: Record<ContrastCheck["level"], string> = {
    aaa: "text-[var(--color-success)]",
    aa: "text-[var(--color-success)]",
    aaLarge: "text-brand-amber",
    fail: "text-destructive",
};

/**
 * How legible black and white text are on the picked colour. Alpha is left out
 * of it — a translucent colour's contrast depends on whatever sits behind it,
 * which the tool has no way of knowing.
 */
export function ContrastPanel({ report, background }: ContrastPanelProps) {
    const t = useTranslations("color.contrast");
    const format = useFormatter();

    const samples = [
        { key: "black", check: report.onBlack, text: "#000000" },
        { key: "white", check: report.onWhite, text: "#ffffff" },
    ] as const;

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[0.9375rem] font-medium tracking-tight">{t("title")}</h3>
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t(`recommendation.${report.bestTextOn}`)}
                </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                {samples.map((sample) => (
                    <div
                        key={sample.key}
                        className="ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset"
                        style={{ background }}
                    >
                        <p
                            className="text-[0.9375rem] leading-[1.4] font-medium"
                            style={{ color: sample.text }}
                        >
                            {t(`sample.${sample.key}`)}
                        </p>
                        <p
                            className="font-mono text-[0.6875rem] tabular-nums"
                            style={{ color: sample.text }}
                        >
                            {t("ratio", { value: format.number(sample.check.ratio) })}
                        </p>
                    </div>
                ))}
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
                {samples.map((sample) => (
                    <div
                        key={sample.key}
                        className="bg-card/60 ring-border/70 flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-inset"
                    >
                        <dt className="text-muted-foreground min-w-0 truncate text-[0.75rem]">
                            {t(`sample.${sample.key}`)}
                        </dt>
                        <dd
                            className={cn(
                                "shrink-0 text-[0.75rem] leading-[1.3] font-medium",
                                LEVEL_TONE[sample.check.level],
                            )}
                        >
                            {t(`levels.${sample.check.level}`)}
                        </dd>
                    </div>
                ))}
            </dl>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.5]">
                {report.onBlack.passesUi || report.onWhite.passesUi ? t("uiPass") : t("uiFail")}
            </p>
        </section>
    );
}
