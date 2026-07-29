"use client";

import { IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useByteLabel } from "@/modules/tools/components/byte-size";
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
 * The two pictures side by side, because the only useful judgement of a repaint
 * is a comparison. Both are shown at the same width so the eye can move between
 * them without rescaling what it just saw.
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

    const panes = [
        { key: "before", url: beforeUrl, caption: t("before") },
        { key: "after", url: afterUrl, caption: t("after") },
    ] as const;

    return (
        <section
            aria-label={t("label")}
            className="ring-border/70 bg-card/60 flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-inset sm:p-5"
        >
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {panes.map((pane) => (
                    <figure key={pane.key} className="flex min-w-0 flex-col gap-1.5">
                        <img
                            src={pane.url}
                            alt={t(`${pane.key}Alt`, { name: facts.name })}
                            decoding="async"
                            className="ring-border/70 bg-muted/40 block h-auto w-full rounded-lg ring-1 ring-inset"
                        />
                        <figcaption className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {pane.caption}
                        </figcaption>
                    </figure>
                ))}
            </div>

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
