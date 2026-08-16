"use client";

import { IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { CompareSlider } from "@/modules/tools/components/compare-slider";
import type { SourceImageFacts } from "../types";

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

    return (
        <section
            aria-label={t("label")}
            className="ring-border/70 bg-card/60 flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-inset sm:p-5"
        >
            <CompareSlider
                beforeUrl={beforeUrl}
                afterUrl={afterUrl}
                beforeAlt={t("beforeAlt", { name: facts.name })}
                afterAlt={t("afterAlt", { name: facts.name })}
                size={facts}
            />

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
