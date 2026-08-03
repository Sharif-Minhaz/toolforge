"use client";

import { IconAlertTriangle, IconDownload, IconLoader2, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import type { ConversionFailureReason, ConvertedImage } from "../types";

export type ConversionRowItem = {
    readonly id: string;
    readonly name: string;
    readonly bytes: number;
    readonly previewUrl: string;
    readonly status: "queued" | "working" | "done" | "failed";
    readonly result: ConvertedImage | null;
    readonly reason: ConversionFailureReason | null;
    /** True once the panel has moved on from the settings this result used. */
    readonly stale: boolean;
};

type ConversionRowProps = {
    item: ConversionRowItem;
    describeFailure: (reason: ConversionFailureReason) => string;
    onDownload: (id: string) => void;
    onRemove: (id: string) => void;
};

/**
 * One file in the queue: what it was, what it became, and the two buttons that
 * apply to it alone.
 *
 * The thumbnail is always the source, never the result. Showing a 16-pixel
 * favicon at 44 pixels would be a comparison nobody can make, and it would mean
 * holding a second object URL per row for a picture too small to judge.
 */
export function ConversionRow({ item, describeFailure, onDownload, onRemove }: ConversionRowProps) {
    const t = useTranslations("imageConverter.workbench");
    const tTargets = useTranslations("imageConverter.targets");
    const byteLabel = useByteLabel();

    const details =
        item.result === null
            ? []
            : [
                  `${byteLabel(item.bytes)} → ${byteLabel(item.result.totalBytes)}`,
                  item.result.files.length > 1 &&
                      t("rowFiles", { count: item.result.files.length }),
                  item.result.iconSizes.length > 0 &&
                      t("rowSizes", { sizes: item.result.iconSizes.join(", ") }),
                  item.result.resized &&
                      t("rowResized", { width: item.result.width, height: item.result.height }),
                  item.result.flattened && t("rowFlattened"),
                  item.result.upscaled && t("rowUpscaled"),
              ].filter(Boolean);

    return (
        <li
            className={cn(
                "bg-card/60 ring-border/70 flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset",
                "transition-opacity duration-200",
                item.stale && "opacity-55",
            )}
        >
            {/*
             * A plain `<img>`, deliberately: the source is an object URL for a
             * file the reader just picked, so there is no remote origin to
             * allowlist and nothing for `next/image` to optimise.
             */}
            <img
                src={item.previewUrl}
                alt={t("previewAlt", { name: item.name })}
                loading="lazy"
                decoding="async"
                className="bg-muted size-11 shrink-0 rounded-lg object-cover"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-[0.8125rem] leading-[1.4] font-medium">{item.name}</p>

                {item.status === "failed" && item.reason !== null ? (
                    <p className="text-destructive flex items-start gap-1 text-[0.6875rem] leading-normal">
                        <IconAlertTriangle
                            className="mt-px size-3 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        <span>{describeFailure(item.reason)}</span>
                    </p>
                ) : item.result === null ? (
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {item.status === "working" ? t("rowWorking") : t("rowPending")}
                    </p>
                ) : (
                    <p className="text-muted-foreground truncate text-[0.6875rem] leading-normal">
                        {details.join(" · ")}
                    </p>
                )}
            </div>

            {item.result !== null && (
                <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[0.625rem] leading-[1.3] font-medium">
                    {tTargets(item.result.target)}
                </span>
            )}

            {item.status === "working" && (
                <IconLoader2
                    className="text-muted-foreground size-4 shrink-0 animate-spin"
                    aria-hidden="true"
                />
            )}

            <div className="flex shrink-0 items-center gap-0.5">
                <Button
                    variant="ghost"
                    aria-label={t("rowDownload", { name: item.name })}
                    disabled={item.result === null}
                    onClick={() => onDownload(item.id)}
                    className="size-8 p-0"
                >
                    <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    aria-label={t("rowRemove", { name: item.name })}
                    onClick={() => onRemove(item.id)}
                    className="size-8 p-0"
                >
                    <IconX className="size-4" stroke={1.8} aria-hidden="true" />
                </Button>
            </div>
        </li>
    );
}
