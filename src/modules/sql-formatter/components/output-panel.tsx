"use client";

import { IconClipboardCheck, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ByteSize } from "@/modules/tools/components/byte-size";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";

type OutputPanelProps = {
    outputId: string;
    output: string;
    outputBytes: number;
    /** True while the debounced input has yet to reach the formatter. */
    pending: boolean;
    onCopy: () => void;
    onDownload: () => void;
};

export function OutputPanel({
    outputId,
    output,
    outputBytes,
    pending,
    onCopy,
    onDownload,
}: OutputPanelProps) {
    const t = useTranslations("sqlFormatter.workbench");
    const empty = output.length === 0;

    return (
        <div className={RESULT_TRAY}>
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                <StepLabel step={2} htmlFor={outputId}>
                    {t("outputLabel")}
                </StepLabel>

                <div className="flex items-center gap-1.5">
                    <ByteSize
                        bytes={outputBytes}
                        className="text-muted-foreground mr-1 font-mono text-[0.6875rem] tabular-nums"
                    />
                    <Button size="sm" onClick={onCopy} disabled={empty}>
                        <IconClipboardCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("copy")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDownload} disabled={empty}>
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>
            </div>

            <Textarea
                id={outputId}
                readOnly
                value={output}
                placeholder={t("outputPlaceholder")}
                spellCheck={false}
                // Dimmed rather than emptied while the debounce settles, so the
                // panel never flashes between two valid results.
                className={cn(
                    "bg-card max-h-96 min-h-44 resize-y rounded-lg font-mono text-[0.8125rem] leading-6 [tab-size:4]",
                    "transition-opacity duration-200",
                    pending && "opacity-55",
                )}
            />
        </div>
    );
}
