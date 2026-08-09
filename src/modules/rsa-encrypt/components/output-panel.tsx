"use client";

import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import type { RsaCryptDirection } from "../types";

type OutputPanelProps = {
    direction: RsaCryptDirection;
    output: string;
    encoding: string;
    encodingItems: Record<string, ReactNode>;
    encodingValues: readonly string[];
    onEncodingChange: (encoding: string) => void;
    status: { tone: StatusTone; message: string };
    /** A second line for what OAEP does and does not promise. */
    notice: { tone: StatusTone; message: string };
    /** True while the typed value has not settled, so the result is one behind. */
    pending: boolean;
    copied: boolean;
    onCopy: () => void;
    onDownload: () => void;
    /**
     * Only while decrypting. Encrypting produces text — hex or base64 — and a
     * second button offering the same thing as bytes would be a choice with no
     * consequence. A decrypted payload may be bytes and nothing else, so there
     * the button is the only way to finish the round trip.
     */
    onDownloadBytes: (() => void) | null;
};

export function OutputPanel({
    direction,
    output,
    encoding,
    encodingItems,
    encodingValues,
    onEncodingChange,
    status,
    notice,
    pending,
    copied,
    onCopy,
    onDownload,
    onDownloadBytes,
}: OutputPanelProps) {
    const t = useTranslations("rsaEncrypt.workbench");

    const outputId = useId();
    const encodingLabelId = useId();

    const side = direction === "encrypt" ? "ciphertext" : "plaintext";

    return (
        <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t(`outputLabel.${side}`)}</span>
                </Label>

                <div className="flex items-center gap-1.5">
                    <Label id={encodingLabelId} className="sr-only">
                        {t(`encodingLabel.${side}`)}
                    </Label>
                    <Select
                        items={encodingItems}
                        value={encoding}
                        onValueChange={(next) => {
                            if (next !== null) {
                                onEncodingChange(next);
                            }
                        }}
                    >
                        <SelectTrigger
                            aria-labelledby={encodingLabelId}
                            className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-[0.6875rem] shadow-none"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {encodingValues.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {encodingItems[item]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <button
                        type="button"
                        onClick={onDownload}
                        disabled={output.length === 0}
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-7 px-2 text-[0.6875rem]",
                        )}
                    >
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </button>
                    {onDownloadBytes !== null && (
                        <button
                            type="button"
                            onClick={onDownloadBytes}
                            disabled={output.length === 0}
                            className={cn(
                                buttonVariants({ variant: "outline", size: "sm" }),
                                "h-7 px-2 text-[0.6875rem]",
                            )}
                        >
                            <IconFileDownload
                                className="size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("downloadBytes")}
                        </button>
                    )}
                    <IconCopyButton
                        copied={copied}
                        onClick={onCopy}
                        disabled={output.length === 0}
                        aria-label={t(`copyOutput.${side}`)}
                        className="disabled:pointer-events-none disabled:opacity-40"
                    />
                </div>
            </div>

            <output
                id={outputId}
                className={cn(
                    "bg-muted/40 min-h-28 rounded-lg px-2.5 py-2",
                    "font-mono text-[0.8125rem] leading-6 break-all whitespace-pre-wrap",
                    "transition-opacity duration-200",
                    // Dimmed rather than blanked: the previous answer is more
                    // use than an empty box while the next one runs.
                    pending && "opacity-55",
                )}
            >
                {output.length > 0 ? (
                    output
                ) : (
                    <span className="text-muted-foreground">{t("outputPlaceholder")}</span>
                )}
            </output>

            <StatusStrip tone={status.tone} message={status.message} />

            {/* Two downloads need one sentence saying how they differ, and it
                belongs where the buttons are rather than only in the article. */}
            {onDownloadBytes !== null && (
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t("downloadHint")}
                </p>
            )}

            <StatusStrip
                tone={notice.tone}
                message={notice.message}
                className="border-border/60 border-t pt-2"
            />
        </div>
    );
}
