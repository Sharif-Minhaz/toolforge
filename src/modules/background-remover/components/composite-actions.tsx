"use client";

import { IconAlertTriangle, IconDownload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useByteLabel } from "@/modules/tools/components/byte-size";

import { keepsAlpha } from "../domain/filenames";
import {
    COMPOSITE_FORMATS,
    type BackgroundChoice,
    type CompositeFormat,
    type SourceImageFacts,
} from "../types";

type CompositeActionsProps = {
    readonly facts: SourceImageFacts;
    readonly resultBytes: number;
    readonly background: BackgroundChoice;
    readonly format: CompositeFormat;
    readonly busy: boolean;
    readonly onFormatChange: (format: CompositeFormat) => void;
    readonly onDownload: () => void;
};

/**
 * What is under the picture: its facts, the format it will be written as, and
 * the button that writes it.
 *
 * The format picker stays enabled for every combination, including the one that
 * throws the alpha channel away. Choosing JPEG for a transparent cut-out is a
 * legitimate thing to want — it flattens onto white, which is what a great deal
 * of e-commerce software expects — so the answer is a warning the reader can act
 * on rather than a control they cannot press and are left to guess about.
 */
export function CompositeActions({
    facts,
    resultBytes,
    background,
    format,
    busy,
    onFormatChange,
    onDownload,
}: CompositeActionsProps) {
    const t = useTranslations("backgroundRemover.result");
    const formatter = useFormatter();
    const byteLabel = useByteLabel();

    const losesTransparency = background.kind === "transparent" && !keepsAlpha(format);

    return (
        <div className="flex min-w-0 flex-col gap-3">
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

            <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-muted-foreground text-xs leading-[1.3]">{t("format")}</span>

                <Tabs
                    value={format}
                    onValueChange={(next) => {
                        if (next !== null) {
                            onFormatChange(next as CompositeFormat);
                        }
                    }}
                >
                    <TabsList className="w-full max-w-64">
                        {COMPOSITE_FORMATS.map((name) => (
                            <TabsTrigger key={name} value={name} disabled={busy} className="flex-1">
                                {t(`formats.${name}`)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {losesTransparency ? (
                    <p className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                        <IconAlertTriangle
                            className="mt-px size-3.5 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        <span>{t("alphaWarning")}</span>
                    </p>
                ) : (
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("formatHint")}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    disabled={busy}
                    onClick={onDownload}
                    className="h-9 px-3.5"
                >
                    <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("download")}
                </Button>
            </div>

            {/*
             * The Pexels credit is not here. It renders under the picture in
             * `CutoutStage`, which is the copy that gets screenshotted and shown
             * to whoever is deciding whether the photograph may be used — and one
             * credit in the right place beats two in two.
             */}
            <p className="text-muted-foreground max-w-[68ch] text-[0.8125rem] leading-6">
                {t("note")}
            </p>
        </div>
    );
}
