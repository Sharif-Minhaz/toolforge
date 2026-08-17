"use client";

import { IconExternalLink } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { CompareSlider } from "@/modules/tools/components/compare-slider";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";

import type { CutoutProgress } from "../domain/removal";
import type { PhotoCredit, SourceImageFacts } from "../types";

type CutoutStageProps = {
    readonly facts: SourceImageFacts;
    readonly sourceUrl: string;
    /** The composited result, once there is one. */
    readonly compositeUrl: string | null;
    /** True when the composite carries an alpha channel worth showing through. */
    readonly checkered: boolean;
    readonly progress: CutoutProgress | null;
    /** Dimmed while the composite on screen no longer matches the controls. */
    readonly stale: boolean;
    /**
     * Whose photograph is behind the subject, when it is a stock one.
     *
     * Rendered over the foot of the picture rather than in the panel below,
     * because the Pexels licence asks for the credit wherever the photograph is
     * shown — and the picture is what somebody screenshots, drags out, or shows
     * to whoever is deciding if they may use it.
     */
    readonly credit: PhotoCredit | null;
};

/**
 * The picture, before and after, in its own card.
 *
 * Before a cut-out exists this is just the source at its own aspect ratio, which
 * matters more than it sounds: the reader has to see *what they dropped in*
 * before pressing a button that takes several seconds, or a mis-drop costs them
 * the whole wait to discover.
 *
 * Afterwards it becomes the shared compare slider, with the checkerboard behind
 * it whenever the result has an alpha channel — because "transparent" drawn onto
 * a dark card and "black background" are the same pixels, and telling them apart
 * is the entire question this tool was opened to answer.
 */
export function CutoutStage({
    facts,
    sourceUrl,
    compositeUrl,
    checkered,
    progress,
    stale,
    credit,
}: CutoutStageProps) {
    const t = useTranslations("backgroundRemover.workbench");
    const tResult = useTranslations("backgroundRemover.result");
    const formatter = useFormatter();

    return (
        <div
            className={cn(
                "ring-border/70 bg-card/60 relative flex min-w-0 flex-col gap-2 rounded-2xl p-3 ring-1 ring-inset sm:p-4",
                stale && "opacity-55 transition-opacity duration-200",
            )}
        >
            {compositeUrl !== null ? (
                <CompareSlider
                    beforeUrl={sourceUrl}
                    afterUrl={compositeUrl}
                    beforeAlt={t("beforeAlt", { name: facts.name })}
                    afterAlt={t("afterAlt", { name: facts.name })}
                    size={facts}
                    checkered={checkered}
                />
            ) : (
                <div
                    style={{ maxWidth: previewFrameMaxWidth(facts) }}
                    className="relative isolate mx-auto min-w-0 overflow-hidden rounded-lg"
                >
                    <img
                        src={sourceUrl}
                        alt={t("sourceAlt", { name: facts.name })}
                        decoding="async"
                        className="bg-muted/30 block h-auto w-full"
                    />

                    {progress !== null && (
                        <div
                            // Over the reader's own photograph rather than over a
                            // themed surface, so these colours are literals — the
                            // same exception the mask overlay takes.
                            className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]"
                        >
                            <div className="flex w-full max-w-64 flex-col gap-2 px-4 text-white">
                                <p className="text-center text-[0.8125rem] leading-[1.4] font-medium">
                                    {progress.phase === "download"
                                        ? t("downloadingModel")
                                        : t("computing")}
                                </p>

                                <div
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.round(progress.ratio * 100)}
                                    aria-label={
                                        progress.phase === "download"
                                            ? t("downloadingModel")
                                            : t("computing")
                                    }
                                    className="h-1.5 w-full overflow-hidden rounded-full bg-white/25"
                                >
                                    <span
                                        style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                                        className="block h-full rounded-full bg-white transition-[width] duration-200"
                                    />
                                </div>

                                <p className="text-center text-[0.6875rem] leading-normal text-white/85 tabular-nums">
                                    {formatter.number(progress.ratio, { style: "percent" })}
                                </p>

                                {progress.phase === "download" && (
                                    <p className="text-center text-[0.6875rem] leading-normal text-white/70">
                                        {t("downloadingOnce")}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {credit !== null && (
                <p className="text-muted-foreground flex min-w-0 flex-wrap items-center justify-center gap-1 text-[0.6875rem] leading-normal">
                    {tResult.rich("credit", {
                        photographer: (chunks) => (
                            <a
                                href={credit.photographerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-foreground underline underline-offset-2"
                            >
                                {chunks}
                            </a>
                        ),
                        source: (chunks) => (
                            <a
                                href={credit.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-foreground inline-flex items-center gap-0.5 underline underline-offset-2"
                            >
                                {chunks}
                                <IconExternalLink
                                    className="size-3 shrink-0"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                            </a>
                        ),
                        name: credit.photographer,
                    })}
                </p>
            )}
        </div>
    );
}
