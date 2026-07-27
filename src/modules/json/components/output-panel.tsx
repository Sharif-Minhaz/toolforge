"use client";

import { IconAlertTriangle, IconClipboardCheck, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ByteSize } from "@/modules/tools/components/byte-size";
import { JsonCode } from "./json-code";

type OutputPanelProps = {
    outputId: string;
    output: string;
    outputBytes: number;
    /** Already-localised size comparison, or `null` when there is nothing to compare. */
    sizeLabel: string | null;
    /** Already-localised failure message, or `null` when the document parsed. */
    error: string | null;
    /** True while the debounced input has yet to reach the formatter. */
    pending: boolean;
    onCopy: () => void;
    onDownload: () => void;
};

export function OutputPanel({
    outputId,
    output,
    outputBytes,
    sizeLabel,
    error,
    pending,
    onCopy,
    onDownload,
}: OutputPanelProps) {
    const t = useTranslations("json.workbench");
    const empty = output.length === 0;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Names the code region below. Not a <label>: a <pre> is not a
                    form control, so there is nothing for one to point at. */}
                <p id={outputId} className="text-muted-foreground text-xs leading-[1.3]">
                    {t("outputLabel")}
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                    {error === null && (
                        <ByteSize
                            bytes={outputBytes}
                            className="text-muted-foreground mr-1 font-mono text-[0.6875rem] tabular-nums"
                        />
                    )}
                    <Button variant="outline" size="sm" onClick={onCopy} disabled={empty}>
                        <IconClipboardCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("copy")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDownload} disabled={empty}>
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>
            </div>

            {error === null ? (
                <JsonCode
                    code={output}
                    labelledBy={outputId}
                    placeholder={t("outputPlaceholder")}
                    // Dimmed rather than emptied while the debounce settles, so
                    // the panel never flashes between two valid results.
                    className={cn("transition-opacity duration-200", pending && "opacity-55")}
                />
            ) : (
                <p
                    role="alert"
                    className={cn(
                        "text-destructive ring-destructive/30 bg-destructive/8 flex min-h-40 items-start gap-2.5 rounded-xl p-3 text-[0.8125rem] leading-6 ring-1 ring-inset",
                        "transition-opacity duration-200",
                        pending && "opacity-55",
                    )}
                >
                    <IconAlertTriangle
                        className="mt-0.5 size-4 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    <span className="min-w-0">{error}</span>
                </p>
            )}

            {sizeLabel !== null && error === null && (
                <p
                    className={cn(
                        "text-muted-foreground text-[0.6875rem] leading-normal transition-opacity duration-200",
                        pending && "opacity-55",
                    )}
                >
                    {sizeLabel}
                </p>
            )}
        </div>
    );
}
