import {
    MIN_FEATHER_PX,
    MIN_REGION_SIDE,
    REGION_FEATHER_RATIO,
    REGION_PADDING_RATIO,
} from "./constants";
import type { MaskBounds, MaskStroke, PixelSize, RemovalRegion } from "../types";

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

/**
 * The box the painted strokes cover, inflated by each stroke's own radius and
 * clipped to the picture. `null` when nothing has been painted, so the caller
 * has one thing to check rather than a zero-area box to reason about.
 */
export function measureMaskBounds(
    strokes: readonly MaskStroke[],
    size: PixelSize,
): MaskBounds | null {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const stroke of strokes) {
        const reach = stroke.radius;

        for (const point of stroke.points) {
            left = Math.min(left, point.x - reach);
            top = Math.min(top, point.y - reach);
            right = Math.max(right, point.x + reach);
            bottom = Math.max(bottom, point.y + reach);
        }
    }

    if (left === Number.POSITIVE_INFINITY) {
        return null;
    }

    return {
        left: clamp(left, 0, size.width),
        top: clamp(top, 0, size.height),
        right: clamp(right, 0, size.width),
        bottom: clamp(bottom, 0, size.height),
    };
}

/**
 * Chooses the square of the original that gets sent to the model.
 *
 * Square because the model canvas is square: cropping a square means the crop is
 * scaled, never stretched, so the repainted pixels drop back onto the original
 * without any distortion to undo. It is centred on the painted area, padded for
 * context, floored at `MIN_REGION_SIDE`, and capped by the picture's shorter
 * side — a square larger than that could not fit inside the image at all.
 *
 * The offset is then pulled back inside the bounds, so a watermark in a corner
 * yields a square flush with that corner rather than one hanging off the edge.
 *
 * Returns `null` when nothing has been painted; there is no region to repaint.
 */
export function planRemovalRegion(
    strokes: readonly MaskStroke[],
    size: PixelSize,
): RemovalRegion | null {
    const bounds = measureMaskBounds(strokes, size);

    if (bounds === null) {
        return null;
    }

    const shorterSide = Math.min(size.width, size.height);
    const painted = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const padded = painted * (1 + REGION_PADDING_RATIO * 2);

    const side = clamp(Math.ceil(padded), Math.min(MIN_REGION_SIDE, shorterSide), shorterSide);

    const centreX = (bounds.left + bounds.right) / 2;
    const centreY = (bounds.top + bounds.bottom) / 2;

    return {
        x: clamp(Math.round(centreX - side / 2), 0, size.width - side),
        y: clamp(Math.round(centreY - side / 2), 0, size.height - side),
        side,
    };
}

/**
 * How wide the repainted patch's edge fade should be, in the region's own pixels.
 * Scaled to the region so a crop from a phone photo and one from a thumbnail
 * blend by the same *visual* amount rather than the same pixel count.
 */
export function featherRadius(side: number): number {
    return Math.max(MIN_FEATHER_PX, Math.round(side * REGION_FEATHER_RATIO));
}
