"use client";

import { IconChevronLeft, IconChevronRight, IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";
import type { SourceImageFacts } from "../types";

/** Divider starts in the middle, so both halves are visible before any input. */
const INITIAL_REVEAL = 50;

type CleanedResultProps = {
    beforeUrl: string;
    afterUrl: string;
    facts: SourceImageFacts;
    /** Size of the composed PNG, which is not the size of the upload. */
    resultBytes: number;
    onDownload: () => void;
};

/**
 * One picture with a divider through it, rather than two pictures side by side.
 *
 * A repaint is judged by whether the eye can find the seam, and two separate
 * images at half the width each make that harder than it needs to be: the reader
 * has to look away and back, at a smaller copy, and rescale what they just saw.
 * Sliding the divider puts both versions in the same pixels instead.
 *
 * The control is a real `<input type="range">` laid over the image at zero
 * opacity. That is the whole accessibility story for free — pointer drag, arrow
 * keys, `Home`/`End`, a focus ring, and a value a screen reader can announce —
 * where hand-rolled pointer handlers would have delivered the first of those and
 * none of the rest. Its thumb is zeroed out so the value maps across the full
 * track width and the visible divider sits exactly under the pointer.
 */
export function CleanedResult({
    beforeUrl,
    afterUrl,
    facts,
    resultBytes,
    onDownload,
}: CleanedResultProps) {
    const t = useTranslations("watermarkRemover.result");
    const formatter = useFormatter();
    const byteLabel = useByteLabel();

    const hintId = useId();
    const [reveal, setReveal] = useState(INITIAL_REVEAL);

    return (
        <section
            aria-label={t("label")}
            className="ring-border/70 bg-card/60 flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-inset sm:p-5"
        >
            {/*
             * Every colour inside this box is a literal rather than a token, and
             * has to be: the chips, the divider, and the handle sit over the
             * reader's own photograph, so they need contrast against arbitrary
             * pixels rather than against either theme's surfaces.
             */}
            <div
                // Capped by width rather than by height, so the clipped original
                // above still lines up pixel for pixel with the repainted one
                // underneath it. See `tools/domain/preview-frame.ts`.
                style={{ maxWidth: previewFrameMaxWidth(facts) }}
                className="group/compare relative isolate mx-auto min-w-0 overflow-hidden rounded-lg select-none"
            >
                {/*
                 * Plain `<img>`s, deliberately: both sources are object URLs for
                 * bytes made in this browser, so there is no origin to allowlist
                 * and nothing for `next/image` to optimise. The repainted one is
                 * in flow and sets the height; the original is clipped over it.
                 */}
                <img
                    src={afterUrl}
                    alt={t("afterAlt", { name: facts.name })}
                    decoding="async"
                    className="bg-muted/40 block h-auto w-full"
                />

                <img
                    src={beforeUrl}
                    alt={t("beforeAlt", { name: facts.name })}
                    decoding="async"
                    style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
                    className="absolute inset-0 h-full w-full object-cover"
                />

                <span
                    aria-hidden="true"
                    style={{ left: `${reveal}%` }}
                    className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.55)]"
                />

                <span
                    aria-hidden="true"
                    style={{ left: `${reveal}%` }}
                    className="pointer-events-none absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] ring-1 ring-white/80 backdrop-blur-[2px] transition-transform duration-200 group-focus-within/compare:scale-110"
                >
                    <span className="flex items-center -space-x-1">
                        <IconChevronLeft className="size-3.5" stroke={2.4} />
                        <IconChevronRight className="size-3.5" stroke={2.4} />
                    </span>
                </span>

                <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/55 px-2 py-1 text-[0.6875rem] leading-[1.3] font-medium text-white">
                    {t("before")}
                </span>

                <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/55 px-2 py-1 text-[0.6875rem] leading-[1.3] font-medium text-white">
                    {t("after")}
                </span>

                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={reveal}
                    onChange={(event) => setReveal(event.target.valueAsNumber)}
                    aria-label={t("compareLabel")}
                    aria-describedby={hintId}
                    aria-valuetext={t("compareValue", {
                        percent: formatter.number(reveal / 100, { style: "percent" }),
                    })}
                    className="focus-visible:ring-ring absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [&::-moz-range-thumb]:h-full [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-full [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:appearance-none"
                />
            </div>

            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-normal">
                {t("compareHint")}
            </p>

            <dl className="grid min-w-0 grid-cols-2 gap-2">
                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                    <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("dimensions")}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">
                        {t("pixels", {
                            width: formatter.number(facts.width),
                            height: formatter.number(facts.height),
                        })}
                    </dd>
                </div>

                <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset">
                    <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("size")}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">{byteLabel(resultBytes)}</dd>
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
        </section>
    );
}
