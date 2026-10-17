"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ImagePixelSize } from "../domain/image-element";
import { imageFormatLabel } from "../domain/image-file";
import { useByteLabel } from "./byte-size";

/**
 * The pieces a batch image tool's queue shares with the other batch image tool.
 *
 * Both the compressor and the converter list what was picked directly under the
 * intake, with the same heading and the same one-line description of each
 * source. The rows themselves stay in each module — what a result *is* differs
 * between them — but "what did I just drop in" has one answer on both pages.
 */

type ImageQueueHeaderProps = {
    /** Pointed at by the list's `aria-labelledby`. */
    readonly id: string;
    readonly count: number;
    readonly totalBytes: number;
    readonly actions?: ReactNode;
};

export function ImageQueueHeader({ id, count, totalBytes, actions }: ImageQueueHeaderProps) {
    const t = useTranslations("imageQueue");
    const byteLabel = useByteLabel();

    return (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3
                id={id}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[0.875rem] leading-[1.3] font-medium"
            >
                {t("heading")}
                <span className="text-muted-foreground text-[0.75rem] font-normal tabular-nums">
                    {t("summary", { count, size: byteLabel(totalBytes) })}
                </span>
            </h3>

            {actions !== undefined && (
                <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
            )}
        </div>
    );
}

type ImageSourceFactsProps = {
    readonly bytes: number;
    /** The resolved MIME type, so an SVG with no declared type still gets named. */
    readonly type: string;
    /** `null` until the browser has measured the picture, or when it could not. */
    readonly dimensions: ImagePixelSize | null;
    readonly className?: string;
};

/** `1920 × 1080 px · 2.4 MB · JPG` — what the reader dropped in, before anything ran. */
export function ImageSourceFacts({ bytes, type, dimensions, className }: ImageSourceFactsProps) {
    const t = useTranslations("imageQueue");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    const facts = [
        dimensions === null
            ? null
            : t("pixels", {
                  width: format.number(dimensions.width, { useGrouping: false }),
                  height: format.number(dimensions.height, { useGrouping: false }),
              }),
        byteLabel(bytes),
        imageFormatLabel(type),
    ].filter((fact) => fact !== null);

    return (
        <p
            className={cn(
                "text-muted-foreground truncate text-[0.6875rem] leading-normal tabular-nums",
                className,
            )}
        >
            {facts.join(" · ")}
        </p>
    );
}
