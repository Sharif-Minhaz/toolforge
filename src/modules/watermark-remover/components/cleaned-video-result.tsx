"use client";

import { IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import type { CleanedVideo, SourceVideoFacts } from "../types";

type CleanedVideoResultProps = {
    beforeUrl: string;
    afterUrl: string;
    facts: SourceVideoFacts;
    video: CleanedVideo;
    onDownload: () => void;
};

/**
 * Two players, not one with a divider through it.
 *
 * The picture half compares with a slider because both halves of a still are the
 * same instant. Two clips are not: they would have to be kept frame-accurately in
 * step for a divider to mean anything, and a divider over a video that has
 * drifted by two frames shows a seam that is not there. Side by side, each with
 * its own controls, lets the reader put both on the same moment themselves and
 * makes no claim the players cannot keep.
 */
export function CleanedVideoResult({
    beforeUrl,
    afterUrl,
    facts,
    video,
    onDownload,
}: CleanedVideoResultProps) {
    const t = useTranslations("watermarkRemover.videoResult");
    const formatter = useFormatter();
    const byteLabel = useByteLabel();

    const players = [
        { key: "before" as const, url: beforeUrl, caption: t("before") },
        { key: "after" as const, url: afterUrl, caption: t("after") },
    ];

    return (
        <section
            aria-label={t("label")}
            className="ring-border/70 bg-card/60 flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-inset sm:p-5"
        >
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {players.map((player) => (
                    <figure key={player.key} className="flex min-w-0 flex-col gap-1.5">
                        <video
                            src={player.url}
                            controls
                            playsInline
                            preload="metadata"
                            aria-label={t(`${player.key}Alt`, { name: facts.name })}
                            className="border-border/70 block h-auto w-full rounded-lg border bg-black"
                        />
                        <figcaption className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {player.caption}
                        </figcaption>
                    </figure>
                ))}
            </div>

            <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                    <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("dimensions")}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">
                        {t("pixels", {
                            width: formatter.number(video.width),
                            height: formatter.number(video.height),
                        })}
                    </dd>
                </div>

                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                    <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("duration")}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">
                        {t("seconds", {
                            value: formatter.number(video.durationSeconds, {
                                maximumFractionDigits: 1,
                            }),
                        })}
                    </dd>
                </div>

                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                    <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("repainted")}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">
                        {t("pixels", {
                            width: formatter.number(video.repainted.width),
                            height: formatter.number(video.repainted.height),
                        })}
                    </dd>
                </div>

                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                    <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("size")}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">{byteLabel(video.blob.size)}</dd>
                </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    onClick={onDownload}
                    className="h-8 px-3 text-[0.8125rem]"
                >
                    <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("download")}
                </Button>
            </div>

            <p className="text-muted-foreground max-w-[68ch] text-[0.8125rem] leading-6">
                {t("note")}
            </p>

            {!video.audioKept && (
                <p className="text-brand-amber max-w-[68ch] text-[0.8125rem] leading-6">
                    {t("audioDropped")}
                </p>
            )}
        </section>
    );
}
