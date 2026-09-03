"use client";

import { IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";
import type { CleanedVideo, SourceVideoFacts } from "../types";

/** Shorter than a single preview's ceiling: these two share a row. */
const PLAYER_MAX_HEIGHT_PX = 460;
const PLAYER_MAX_HEIGHT_SVH = 56;

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

    // The ceiling that keeps a tall clip on one screen, applied to the figure
    // rather than the video: the caption has to travel with it, and a figure
    // wider than its own player would put the label off to one side.
    const playerMaxWidth = previewFrameMaxWidth(
        { width: video.width, height: video.height },
        PLAYER_MAX_HEIGHT_PX,
        PLAYER_MAX_HEIGHT_SVH,
    );

    return (
        <section
            aria-label={t("label")}
            className="ring-border/70 bg-card/60 flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-inset sm:p-5"
        >
            {/*
                A centred row rather than two equal halves.

                A grid of two columns gives each player half the card whatever
                shape it is, and a portrait clip capped to fit the page then
                floats in the middle of a column three times its width — two
                narrow strips with a canyon between them and empty card either
                side. Letting each figure grow to the cap and centring the pair
                keeps them side by side and touching, so the two corners being
                compared are as close together as the page allows. A landscape
                clip hits the cap far past half the card, so it still splits the
                row evenly and nothing changes for it.
            */}
            <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-center">
                {players.map((player) => (
                    <figure
                        key={player.key}
                        style={{ maxWidth: playerMaxWidth }}
                        className="flex w-full min-w-0 flex-1 flex-col gap-1.5"
                    >
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

            {/*
                Said where the download is, not in the article underneath. An
                MP4 carrying Opus is legal and plays in Chrome, Edge and Firefox;
                QuickTime and Safari show the picture in silence. Somebody about
                to post the file is the person who needs to know that, at the
                moment they are about to post it.
            */}
            {video.audioKept && video.audioCodec !== null && video.audioCodec !== "aac" && (
                <p className="text-brand-amber max-w-[68ch] text-[0.8125rem] leading-6">
                    {t("audioNote", { codec: video.audioCodec.toUpperCase() })}
                </p>
            )}
        </section>
    );
}
