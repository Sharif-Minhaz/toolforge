"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { placeholderSize } from "../domain/aspect";
import { decodeBlurhash } from "../domain/blurhash";
import { PREVIEW_EDGE } from "../domain/constants";

type BlurPreviewProps = {
    hash: string;
    /** The placeholder's shape; only the ratio is read. */
    width: number;
    height: number;
    punch: number;
    label: string;
    className?: string;
};

/**
 * The hash, painted at a size worth looking at.
 *
 * Not the `blurDataURL` in an `<img>`, which is what this used to be: that
 * picture is 32 pixels on its longest edge because it has to be inlined into
 * your HTML, and stretching it across a card is bilinear interpolation between
 * 32 samples rather than the curve those samples came from. The faceting is
 * visible, and worse, it flattens the difference between 4 × 3 and 8 × 6 — so
 * the one control that decides whether the blur resembles the picture looked
 * like it did nothing.
 *
 * A hash has no resolution, so painting it at display size is not an
 * enlargement of anything; it is the function evaluated on a finer grid. That
 * is also what react-blurhash does on the reader's own machine, and what
 * `next/image` approximates by putting a Gaussian filter over the small one.
 *
 * Painting happens in an effect because a canvas is written to rather than
 * rendered — no state is set, so nothing here is the hydration hazard that
 * seeding state from an effect would be. The server pass emits an empty canvas
 * of the right size, which is exactly what it should reserve.
 */
export function BlurPreview({ hash, width, height, punch, label, className }: BlurPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const size = placeholderSize({ width, height }, PREVIEW_EDGE);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d") ?? null;

        if (context === null) {
            return;
        }

        const painted = decodeBlurhash(hash, size.width, size.height, punch);

        if (!painted.ok) {
            // The caller only renders this for a hash that already decoded, so
            // leaving the canvas as it was beats blanking it on a race.
            return;
        }

        context.putImageData(new ImageData(painted.pixels, size.width, size.height), 0, 0);
    }, [hash, punch, size.width, size.height]);

    return (
        <canvas
            ref={canvasRef}
            width={size.width}
            height={size.height}
            role="img"
            aria-label={label}
            className={cn("block h-auto w-full", className)}
        />
    );
}
