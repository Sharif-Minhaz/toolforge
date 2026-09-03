import {
    DEFAULT_BOX_SIDE_RATIO,
    MAX_BOX_SIDE_RATIO,
    MIN_BOX_SIDE_RATIO,
    WATERMARK_INSET_RATIO,
} from "./video-constants";
import type { BoxCorner, NormalizedBox, PixelBox } from "../types";
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

/** True for the two corners whose x is measured from the right-hand edge. */
export function isRightCorner(corner: BoxCorner): boolean {
    return corner === "bottom-right" || corner === "top-right";
}

/** True for the two corners whose y is measured from the bottom edge. */
export function isBottomCorner(corner: BoxCorner): boolean {
    return corner === "bottom-left" || corner === "bottom-right";
}

/**
 * Where the search starts before anybody has touched anything: a square centred
 * on where a generator actually puts its mark, which is a fixed proportional
 * inset from one corner rather than flush against it.
 *
 * Centring matters as much as the size. A box flush into the corner puts the
 * mark hard against its inner wall — the glow is clipped on two sides, the
 * background estimate reads its values from inside that glow, and the box drags
 * in a strip of whatever else lives along the frame's edge. Centred, the mark has
 * clean picture all the way around it, which is what every later step assumes.
 *
 * The corner is a parameter because the two halves that use this disagree about
 * it: a Veo clip signs bottom-right, a Gemini still signs bottom-left, and a
 * single hard-coded corner would put one of them's box on empty picture.
 */
export function planCornerBox(size: PixelSize, corner: BoxCorner): NormalizedBox {
    const reference = referenceSide(size);
    const inset = WATERMARK_INSET_RATIO * reference;
    const side = DEFAULT_BOX_SIDE_RATIO * reference;

    const centreX = isRightCorner(corner) ? size.width - inset : inset;
    const centreY = isBottomCorner(corner) ? size.height - inset : inset;

    return clampNormalizedBox(
        {
            x: (centreX - side / 2) / size.width,
            y: (centreY - side / 2) / size.height,
            side: DEFAULT_BOX_SIDE_RATIO,
        },
        size,
    );
}

/** The clip half's corner, which is the one this file was written for. */
export function planDefaultBox(size: PixelSize): NormalizedBox {
    return planCornerBox(size, "bottom-right");
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
 * Grows or shrinks the box with the corner it was planned against pinned.
 *
 * The conventional anchor is the top-left, but the thing inside this box sits in
 * a corner of the frame: pinning *that* corner means enlarging the box reaches
 * further into the picture instead of sliding off the edge and being clamped
 * back. Which corner that is depends on where the generator signs, so it is a
 * parameter — defaulted to the clip half's bottom-right, which is where this
 * behaviour was worked out.
 */
export function resizeNormalizedBox(
    box: NormalizedBox,
    delta: number,
    size: PixelSize,
    corner: BoxCorner = "bottom-right",
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
            x: (isRightCorner(corner) ? right - side : current.x) / size.width,
            y: (isBottomCorner(corner) ? bottom - side : current.y) / size.height,
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
