"use client";

import {
    IconCamera,
    IconDownload,
    IconHelpCircle,
    IconSparkles,
    type IconProps,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import type { ImageConfidenceBand, ImageVerdict, ImageVerdictLabel } from "../types";

/**
 * One variable per verdict, read by the tile, the ring, and the meter.
 * `unknown` deliberately borrows the muted foreground: a non-answer should look
 * like a non-answer, not like a third finding.
 */
const LABEL_ACCENT: Record<ImageVerdictLabel, string> = {
    "ai-generated": "[--verdict-accent:var(--brand-rose)]",
    authentic: "[--verdict-accent:var(--success)]",
    unknown: "[--verdict-accent:var(--muted-foreground)]",
};

const LABEL_ICON: Record<ImageVerdictLabel, ComponentType<IconProps>> = {
    "ai-generated": IconSparkles,
    authentic: IconCamera,
    unknown: IconHelpCircle,
};

/**
 * The model reports a word, not a number, so the meter counts filled steps
 * instead of pretending to a percentage it was never given.
 */
const BAND_STEPS: Record<ImageConfidenceBand, number> = {
    unknown: 0,
    low: 1,
    medium: 2,
    high: 3,
};

const BAND_STEP_COUNT = 3;

type ImageVerdictPanelProps = {
    verdict: ImageVerdict;
    copied: boolean;
    onCopy: () => void;
    onDownload: () => void;
};

export function ImageVerdictPanel({ verdict, copied, onCopy, onDownload }: ImageVerdictPanelProps) {
    const t = useTranslations("aiImageDetector.workbench");
    const tLabels = useTranslations("aiImageDetector.labels");
    const tBands = useTranslations("aiImageDetector.bands");

    const Icon = LABEL_ICON[verdict.label];
    const filled = BAND_STEPS[verdict.band];

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
                        {tLabels(verdict.label)}
                    </p>
                    <p className="text-muted-foreground text-[0.8125rem] leading-[1.4]">
                        {tBands(verdict.band)}
                    </p>
                </div>

                <ul
                    aria-label={t("confidenceLabel")}
                    className="mt-1.5 flex shrink-0 items-center gap-1"
                >
                    {Array.from({ length: BAND_STEP_COUNT }, (_, step) => (
                        <li
                            key={step}
                            aria-hidden="true"
                            className={cn(
                                "h-1.5 w-5 rounded-full transition-colors duration-300",
                                step < filled ? "bg-[var(--verdict-accent)]" : "bg-muted",
                            )}
                        />
                    ))}
                </ul>
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
            </div>
        </section>
    );
}
