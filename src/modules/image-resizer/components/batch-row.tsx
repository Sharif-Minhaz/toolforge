"use client";

import { IconAlertTriangle, IconDownload, IconLoader2, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImageSourceFacts } from "@/modules/tools/components/image-queue";
import type { ImagePixelSize } from "@/modules/tools/domain/image-element";

type BatchRowProps = {
    readonly name: string;
    readonly bytes: number;
    readonly type: string;
    /** `null` until the browser has measured the picture, or when it could not. */
    readonly dimensions: ImagePixelSize | null;
    readonly previewUrl: string;
    /** The picture the frame is previewing. */
    readonly selected: boolean;
    readonly working: boolean;
    /** Why the last render of this picture failed, already in words. */
    readonly failure: string | null;
    /** True while anything is rendering, so a second encode cannot be asked for. */
    readonly busy: boolean;
    readonly onSelect: () => void;
    readonly onDownload: () => void;
    readonly onRemove: () => void;
};

/**
 * One picture in a batch: what it is, a press that puts it in the frame, and
 * the two buttons that apply to it alone.
 *
 * Nothing is kept per row but the file. A download renders the picture with
 * whatever the panel says at the moment it is pressed, so there is no result
 * to go stale and no second copy of every picture held in the tab.
 */
export function BatchRow({
    name,
    bytes,
    type,
    dimensions,
    previewUrl,
    selected,
    working,
    failure,
    busy,
    onSelect,
    onDownload,
    onRemove,
}: BatchRowProps) {
    const t = useTranslations("imageResizer.workbench");

    return (
        <li
            className={cn(
                "bg-card/60 flex min-w-0 items-center gap-2 rounded-xl p-2 ring-1 ring-inset",
                selected ? "ring-primary/60" : "ring-border/70",
            )}
        >
            {/*
             * Named by its contents rather than an `aria-label`, so the file's
             * facts and any failure under them are read out with it.
             */}
            <button
                type="button"
                aria-pressed={selected}
                title={t("rowSelect", { name })}
                onClick={onSelect}
                className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none"
            >
                {/*
                 * A plain `<img>`: an object URL for a file the reader just
                 * picked has no remote origin for `next/image` to optimise.
                 * Decorative, because the name beside it is the label.
                 */}
                <img
                    src={previewUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="bg-muted size-12 shrink-0 rounded-lg object-cover"
                />

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[0.8125rem] leading-[1.4] font-medium">
                        {name}
                    </span>
                    <ImageSourceFacts bytes={bytes} type={type} dimensions={dimensions} />
                    {working ? (
                        <span className="text-muted-foreground/80 text-[0.6875rem] leading-normal">
                            {t("rowWorking")}
                        </span>
                    ) : (
                        failure !== null && (
                            <span className="text-destructive flex items-start gap-1 text-[0.6875rem] leading-normal">
                                <IconAlertTriangle
                                    className="mt-px size-3 shrink-0"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {failure}
                            </span>
                        )
                    )}
                </span>
            </button>

            {working && (
                <IconLoader2
                    className="text-muted-foreground size-4 shrink-0 animate-spin"
                    aria-hidden="true"
                />
            )}

            <div className="flex shrink-0 items-center gap-0.5">
                <Button
                    variant="ghost"
                    aria-label={t("rowDownload", { name })}
                    title={t("rowDownload", { name })}
                    disabled={busy}
                    onClick={onDownload}
                    className="size-8 p-0"
                >
                    <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                </Button>
                <Button
                    variant="ghost"
                    aria-label={t("rowRemove", { name })}
                    title={t("rowRemove", { name })}
                    disabled={busy}
                    onClick={onRemove}
                    className="size-8 p-0"
                >
                    <IconX className="size-4" stroke={1.8} aria-hidden="true" />
                </Button>
            </div>
        </li>
    );
}
