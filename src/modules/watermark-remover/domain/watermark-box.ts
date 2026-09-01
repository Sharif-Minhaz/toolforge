import { DEFAULT_BOX_SIDE_RATIO, MAX_BOX_SIDE_RATIO, MIN_BOX_SIDE_RATIO } from "./video-constants";
import type { NormalizedBox, PixelBox } from "../types";
import type { PixelSize } from "../types";

/** Nothing smaller than this can hold a logo and the border the fill reads from. */
const ABSOLUTE_MIN_SIDE_PX = 12;

/**
 * Clamping that also absorbs a `NaN`. Every number here can arrive from pointer
 * arithmetic over an element that has just been laid out, and a division by a
 * zero-width box propagates silently all the way to a canvas call that throws.
 */
function clamp(value: number, low: number, high: number): number {
    if (!Number.isFinite(value)) {
        return low;
    }

    return Math.min(high, Math.max(low, value));
}

/**
 * The frame's shorter side, which every size in this file is measured against.
 *
 * A watermark is square and scales with the picture rather than with either
 * axis, so tying its size to one axis would make the same logo a different
 * fraction of the box on a portrait clip than on a landscape one.
 */
export function referenceSide(size: PixelSize): number {
    return Math.min(size.width, size.height);
}

/**
 * The one place a box becomes pixels. Rounding, the square constraint and the
 * "must stay inside the frame" rule all live here, so no caller can arrive at a
 * box the rest of the pipeline would have to re-check.
 */
export function toPixelBox(box: NormalizedBox, size: PixelSize): PixelBox {
    const reference = referenceSide(size);

    const side = Math.round(
        clamp(box.side * reference, MIN_BOX_SIDE_RATIO * reference, MAX_BOX_SIDE_RATIO * reference),
    );

    // A frame narrower than the floor is not a case worth a second rule: the box
    // simply becomes the frame.
    const bounded = clamp(Math.max(side, ABSOLUTE_MIN_SIDE_PX), 1, reference);

    return {
        x: clamp(Math.round(box.x * size.width), 0, size.width - bounded),
        y: clamp(Math.round(box.y * size.height), 0, size.height - bounded),
        width: bounded,
        height: bounded,
    };
}

/** The inverse, so a box that has been through the pixel rules can be stored again. */
export function toNormalizedBox(box: PixelBox, size: PixelSize): NormalizedBox {
    return {
        x: box.x / size.width,
        y: box.y / size.height,
        side: box.width / referenceSide(size),
    };
}

/** Every rule in `toPixelBox`, applied without leaving normalized space. */
export function clampNormalizedBox(box: NormalizedBox, size: PixelSize): NormalizedBox {
    return toNormalizedBox(toPixelBox(box, size), size);
}

/**
 * Where the search starts before anybody has touched anything: a square flush
 * into the bottom-right corner. Gemini and Veo both sign there, so the common
 * case is that the reader never has to move it.
 */
export function planDefaultBox(size: PixelSize): NormalizedBox {
    const side = Math.round(DEFAULT_BOX_SIDE_RATIO * referenceSide(size));

    return clampNormalizedBox(
        {
            x: (size.width - side) / size.width,
            y: (size.height - side) / size.height,
            side: DEFAULT_BOX_SIDE_RATIO,
        },
        size,
    );
}

/** Moves the box by a share of each axis, clamped back inside the frame. */
export function nudgeNormalizedBox(
    box: NormalizedBox,
    dx: number,
    dy: number,
    size: PixelSize,
): NormalizedBox {
    return clampNormalizedBox({ ...box, x: box.x + dx, y: box.y + dy }, size);
}

/**
 * Grows or shrinks the box with its **bottom-right** corner pinned.
 *
 * The conventional anchor is the top-left, but the thing inside this box sits in
 * the bottom-right of the frame: pinning that corner means enlarging the box
 * reaches further into the picture instead of sliding off the edge and being
 * clamped back.
 */
export function resizeNormalizedBox(
    box: NormalizedBox,
    delta: number,
    size: PixelSize,
): NormalizedBox {
    const reference = referenceSide(size);
    const current = toPixelBox(box, size);
    const side = clamp(
        Math.round((box.side + delta) * reference),
        MIN_BOX_SIDE_RATIO * reference,
        MAX_BOX_SIDE_RATIO * reference,
    );

    const right = current.x + current.width;
    const bottom = current.y + current.height;

    return clampNormalizedBox(
        {
            x: (right - side) / size.width,
            y: (bottom - side) / size.height,
            side: side / reference,
        },
        size,
    );
}

/**
 * Grows a pixel box by a margin on every side, clipped to the frame. Used to put
 * known picture around a mask before it is filled — the fill has to read its
 * answer off something.
 */
export function expandPixelBox(box: PixelBox, margin: number, size: PixelSize): PixelBox {
    const left = clamp(box.x - margin, 0, size.width);
    const top = clamp(box.y - margin, 0, size.height);

    return {
        x: left,
        y: top,
        width: clamp(box.x + box.width + margin, left, size.width) - left,
        height: clamp(box.y + box.height + margin, top, size.height) - top,
    };
}
