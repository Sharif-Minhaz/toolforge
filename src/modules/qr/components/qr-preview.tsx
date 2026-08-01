"use client";

import { IconCopy, IconDownload, IconFileTypeSvg, IconLoader2 } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { MAX_PAYLOAD_LENGTH } from "../domain/constants";
import type { QrMatrix } from "../types";

type QrPreviewProps = {
    /** Already-rendered markup, or `null` when there is nothing to show yet. */
    svg: string | null;
    matrix: QrMatrix | null;
    /** Length of the encoded payload, for the counter under the code. */
    payloadLength: number;
    error: string | null;
    /** The typed value has not settled yet, so the code on screen is one behind. */
    pending: boolean;
    downloading: boolean;
    onDownloadPng: () => void;
    onDownloadSvg: () => void;
    onCopyPayload: () => void;
};

export function QrPreview({
    svg,
    matrix,
    payloadLength,
    error,
    pending,
    downloading,
    onDownloadPng,
    onDownloadSvg,
    onCopyPayload,
}: QrPreviewProps) {
    const t = useTranslations("qr.workbench.preview");
    const format = useFormatter();

    return (
        <div className="flex flex-col gap-3">
            <div
                className={cn(
                    "bg-card ring-border/70 grid aspect-square w-full place-items-center overflow-hidden rounded-2xl p-4 ring-1 ring-inset sm:p-6",
                    "transition-opacity duration-200",
                    pending && "opacity-55",
                )}
            >
                {svg === null ? (
                    <p className="text-muted-foreground max-w-[24ch] text-center text-[0.8125rem] leading-relaxed">
                        {error ?? t("empty")}
                    </p>
                ) : (
                    <div
                        role="img"
                        aria-label={t("alt")}
                        className="[&>svg]:h-auto [&>svg]:w-full"
                        // Built by `renderQrSvg`, which escapes every value that
                        // came from the reader before it reaches an attribute.
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                )}
            </div>

            {matrix !== null && (
                <p className="text-muted-foreground text-center text-[0.6875rem] leading-[1.4]">
                    {t("summary", {
                        version: matrix.version,
                        modules: matrix.size,
                        level: matrix.level,
                    })}
                </p>
            )}

            <p className="text-muted-foreground text-center font-mono text-[0.6875rem]">
                {format.number(payloadLength)} / {format.number(MAX_PAYLOAD_LENGTH)}
            </p>

            {error !== null && svg !== null && (
                <StatusStrip tone="error" message={error} className="justify-center" />
            )}

            <div className="flex flex-col gap-2">
                <Button
                    type="button"
                    onClick={onDownloadPng}
                    disabled={svg === null || downloading}
                    className="w-full"
                >
                    {downloading ? (
                        <IconLoader2
                            className="size-4 animate-spin"
                            stroke={1.8}
                            aria-hidden="true"
                        />
                    ) : (
                        <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                    {t("downloadPng")}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onDownloadSvg}
                        disabled={svg === null}
                    >
                        <IconFileTypeSvg className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("downloadSvg")}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onCopyPayload}
                        disabled={payloadLength === 0}
                    >
                        <IconCopy className="size-4" stroke={1.8} aria-hidden="true" />
                        {t("copyPayload")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
