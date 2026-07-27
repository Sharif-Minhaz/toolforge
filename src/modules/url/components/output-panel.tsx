"use client";

import { IconAlertTriangle, IconClipboardCheck, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ByteSize } from "@/modules/tools/components/byte-size";
import { StatusStrip } from "@/modules/tools/components/status-strip";

type OutputPanelProps = {
    outputId: string;
    output: string;
    outputBytes: number;
    /** How many decode rounds ran; only worth reporting past the first. */
    passes: number;
    /** Already-localised failure message, or `null` when the input converted. */
    error: string | null;
    /** True while the debounced input has yet to reach the converter. */
    pending: boolean;
    onCopy: () => void;
    onDownload: () => void;
};

export function OutputPanel({
    outputId,
    output,
    outputBytes,
    passes,
    error,
    pending,
    onCopy,
    onDownload,
}: OutputPanelProps) {
    const t = useTranslations("url.workbench");
    const empty = output.length === 0;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                    {t("outputLabel")}
                </Label>

                <div className="flex items-center gap-1.5">
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
                <Textarea
                    id={outputId}
                    readOnly
                    value={output}
                    placeholder={t("outputPlaceholder")}
                    spellCheck={false}
                    // Dimmed rather than emptied while the debounce settles, so
                    // the panel never flashes between two valid results.
                    className={cn(
                        "bg-muted/45 max-h-72 min-h-32 resize-y rounded-xl font-mono text-[0.8125rem] leading-6 break-all",
                        "transition-opacity duration-200",
                        pending && "opacity-55",
                    )}
                />
            ) : (
                <p
                    role="alert"
                    className={cn(
                        "text-destructive ring-destructive/30 bg-destructive/8 flex min-h-32 items-start gap-2.5 rounded-xl p-3 text-[0.8125rem] leading-6 ring-1 ring-inset",
                        "transition-opacity duration-200",
                        pending && "opacity-55",
                    )}
                >
                    <IconAlertTriangle
                        className="mt-0.5 size-4 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    {error}
                </p>
            )}

            {/* Repeated decoding is invisible without this: two layers and one
                layer produce very different text from the same input. */}
            {error === null && passes > 1 && (
                <StatusStrip tone="success" message={t("passes", { passes })} />
            )}
        </div>
    );
}
