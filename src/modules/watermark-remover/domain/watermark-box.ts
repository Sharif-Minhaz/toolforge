import {
    DEFAULT_BOX_SIDE_RATIO,
    MAX_BOX_SIDE_RATIO,
    MIN_BOX_SIDE_RATIO,
    WATERMARK_INSET_RATIO,
} from "./video-constants";
import type { BoxCorner, BoxEdges, NormalizedBox, PixelBox } from "../types";
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
 * Smallest edge a box may have on an axis this long. Measured against the shorter
 * side so a thin box is equally thin on either axis; a frame narrower than the
 * floor is not a case worth a second rule, so the floor simply becomes the frame.
 */
function minEdge(size: PixelSize, axis: number): number {
    return Math.min(Math.max(MIN_BOX_SIDE_RATIO * referenceSide(size), ABSOLUTE_MIN_SIDE_PX), axis);
}

/** Largest edge a box may have on an axis this long. */
function maxEdge(size: PixelSize, axis: number): number {
    return Math.max(MAX_BOX_SIDE_RATIO * axis, minEdge(size, axis));
}

/**
 * The one place a box becomes pixels. Rounding, the size limits and the "must
 * stay inside the frame" rule all live here, so no caller can arrive at a box the
 * rest of the pipeline would have to re-check.
 */
export function toPixelBox(box: NormalizedBox, size: PixelSize): PixelBox {
    const width = Math.round(
        clamp(box.width * size.width, minEdge(size, size.width), maxEdge(size, size.width)),
    );
    const height = Math.round(
        clamp(box.height * size.height, minEdge(size, size.height), maxEdge(size, size.height)),
    );

    return {
        x: clamp(Math.round(box.x * size.width), 0, size.width - width),
        y: clamp(Math.round(box.y * size.height), 0, size.height - height),
        width,
        height,
    };
}

/** The inverse, so a box that has been through the pixel rules can be stored again. */
export function toNormalizedBox(box: PixelBox, size: PixelSize): NormalizedBox {
    return {
        x: box.x / size.width,
        y: box.y / size.height,
        width: box.width / size.width,
        height: box.height / size.height,
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
 * Calibrated on clips. A Gemini still signs much nearer its corner and has its
 * own geometry — `planGeminiBox` in `gemini-image.ts`.
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
            width: side / size.width,
            height: side / size.height,
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
 * Moves the edges a handle holds by `dx` and `dy` — shares of each axis — while
 * the opposite edges stay put. Each moving edge stops at the frame and at the
 * size limits rather than pushing the box, so a drag never slides the side the
 * reader was not holding.
 */
export function resizeBoxEdges(
    box: NormalizedBox,
    edges: BoxEdges,
    dx: number,
    dy: number,
    size: PixelSize,
): NormalizedBox {
    const current = toPixelBox(box, size);
    let left = current.x;
    let right = current.x + current.width;
    let top = current.y;
    let bottom = current.y + current.height;

    const [minW, maxW] = [minEdge(size, size.width), maxEdge(size, size.width)];
    const [minH, maxH] = [minEdge(size, size.height), maxEdge(size, size.height)];

    if (edges.x < 0) {
        left = clamp(left + dx * size.width, Math.max(0, right - maxW), right - minW);
    } else if (edges.x > 0) {
        right = clamp(right + dx * size.width, left + minW, Math.min(size.width, left + maxW));
    }

    if (edges.y < 0) {
        top = clamp(top + dy * size.height, Math.max(0, bottom - maxH), bottom - minH);
    } else if (edges.y > 0) {
        bottom = clamp(bottom + dy * size.height, top + minH, Math.min(size.height, top + maxH));
    }

    return clampNormalizedBox(
        toNormalizedBox({ x: left, y: top, width: right - left, height: bottom - top }, size),
        size,
    );
}

/**
 * Grows or shrinks the box on both axes with the corner it was planned against
 * pinned — the keyboard's `+` and `−`.
 *
 * The conventional anchor is the top-left, but the thing inside this box sits in
 * a corner of the frame: pinning *that* corner means enlarging the box reaches
 * further into the picture instead of sliding off the edge and being clamped
 * back. `delta` is a share of the frame's shorter side, so a step grows both
 * axes by the same number of pixels.
 */
export function resizeNormalizedBox(
    box: NormalizedBox,
    delta: number,
    size: PixelSize,
    corner: BoxCorner = "bottom-right",
): NormalizedBox {
    const grow = delta * referenceSide(size);
    const edges: BoxEdges = {
        x: isRightCorner(corner) ? -1 : 1,
        y: isBottomCorner(corner) ? -1 : 1,
    };

    return resizeBoxEdges(
        box,
        edges,
        (edges.x * grow) / size.width,
        (edges.y * grow) / size.height,
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
