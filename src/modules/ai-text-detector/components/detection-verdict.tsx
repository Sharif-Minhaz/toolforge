"use client";

import {
    IconDownload,
    IconHelpCircle,
    IconRobot,
    IconScale,
    IconSparkles,
    IconWriting,
    type IconProps,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import type { DetectionLabel, DetectionVerdict } from "../types";

/**
 * One variable per verdict, read by the tile, the ring, and the meter fill.
 * `unknown` deliberately borrows the muted foreground: a non-answer should look
 * like a non-answer, not like a fourth finding.
 */
const LABEL_ACCENT: Record<DetectionLabel, string> = {
    "ai-generated": "[--verdict-accent:var(--brand-rose)]",
    "human-written": "[--verdict-accent:var(--success)]",
    mixed: "[--verdict-accent:var(--brand-amber)]",
    unknown: "[--verdict-accent:var(--muted-foreground)]",
};

const LABEL_ICON: Record<DetectionLabel, ComponentType<IconProps>> = {
    "ai-generated": IconRobot,
    "human-written": IconWriting,
    mixed: IconScale,
    unknown: IconHelpCircle,
};

type DetectionVerdictPanelProps = {
    verdict: DetectionVerdict;
    copied: boolean;
    onCopy: () => void;
    onDownload: () => void;
};

export function DetectionVerdictPanel({
    verdict,
    copied,
    onCopy,
    onDownload,
}: DetectionVerdictPanelProps) {
    const t = useTranslations("aiTextDetector.workbench");
    const tLabels = useTranslations("aiTextDetector.labels");
    const tBands = useTranslations("aiTextDetector.bands");
    const formatter = useFormatter();

    const Icon = LABEL_ICON[verdict.label];
    const labelText = tLabels(verdict.label);
    const confidenceText = formatter.number(verdict.confidence / 100, { style: "percent" });

    return (
        <section
            aria-label={t("verdictLabel")}
            className={cn(
                "relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl p-4 sm:p-5",
                "bg-[color-mix(in_oklch,var(--verdict-accent)_7%,var(--card))]",
                "ring-1 ring-[color-mix(in_oklch,var(--verdict-accent)_24%,transparent)] ring-inset",
                LABEL_ACCENT[verdict.label],
            )}
        >
            <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[0.6rem] bg-[color-mix(in_oklch,var(--verdict-accent)_14%,transparent)] text-[var(--verdict-accent)] ring-1 ring-[color-mix(in_oklch,var(--verdict-accent)_22%,transparent)] ring-inset">
                    <Icon className="size-5" stroke={1.8} aria-hidden="true" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-[1.0625rem] leading-[1.3] font-semibold tracking-tight">
                        {labelText}
                    </p>
                    <p className="text-muted-foreground text-[0.8125rem] leading-[1.4]">
                        {t("confidenceSummary", {
                            confidence: confidenceText,
                            band: tBands(verdict.band),
                        })}
                    </p>
                </div>

                <span className="font-mono text-2xl leading-none text-[var(--verdict-accent)] tabular-nums">
                    {formatter.number(verdict.confidence)}
                </span>
            </div>

            <div
                role="progressbar"
                aria-label={t("confidenceLabel")}
                aria-valuenow={verdict.confidence}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={confidenceText}
                className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            >
                <div
                    className="h-full rounded-full bg-[var(--verdict-accent)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${verdict.confidence}%` }}
                />
            </div>

            {verdict.reasoning.length > 0 && (
                <p className="text-muted-foreground max-w-[68ch] text-[0.875rem] leading-6">
                    {verdict.reasoning}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={onCopy} className="h-8 px-3 text-[0.8125rem]">
                    <CopyIconSwap copied={copied} />
                    {t("copyVerdict")}
                </Button>
                <Button
                    variant="outline"
                    onClick={onDownload}
                    className="h-8 px-3 text-[0.8125rem]"
                >
                    <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("downloadReport")}
                </Button>
                {verdict.model.length > 0 && (
                    <span className="text-muted-foreground/90 ring-border/70 ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[0.6875rem] ring-1 ring-inset">
                        <IconSparkles className="size-3 shrink-0" stroke={1.9} aria-hidden="true" />
                        <span className="truncate">{verdict.model}</span>
                    </span>
                )}
            </div>
        </section>
    );
}
