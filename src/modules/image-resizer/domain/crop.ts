import { MIN_CROP_SIZE } from "./constants";
import type { CropHandle, CropRect } from "../types";
import type { PixelSize } from "@/modules/tools/types";

/**
 * The crop box, and every way a pointer can change it.
 *
 * All of it in the **source image's** pixel space, never the screen's. The
 * preview is whatever width the viewport allows and changes when the window
 * does; a crop stored in screen pixels silently means something else after a
 * rotation, a sidebar collapse, or a zoom. The island converts once, at the
 * edge, and everything below here is in pixels that exist in the file.
 *
 * Pure, so the fiddliest part of the tool — a ratio-locked corner drag that
 * runs into the edge of the picture — is unit-tested rather than dragged at.
 */

/** Where a rectangle is pinned while the opposite side follows the pointer. */
type AxisAnchor =
    | { readonly kind: "start"; readonly at: number }
    | { readonly kind: "end"; readonly at: number }
    | { readonly kind: "center"; readonly at: number };

export type PointerPoint = {
    readonly x: number;
    readonly y: number;
};

export function fullCrop(size: PixelSize): CropRect {
    return { x: 0, y: 0, width: Math.max(1, size.width), height: Math.max(1, size.height) };
}

export function isFullCrop(rect: CropRect, bounds: PixelSize): boolean {
    return (
        rect.x === 0 && rect.y === 0 && rect.width === bounds.width && rect.height === bounds.height
    );
}

/**
 * A rectangle made integral, at least `MIN_CROP_SIZE` on each side, and wholly
 * inside the picture.
 *
 * The size is clamped before the position, so a box wider than the image is
 * narrowed rather than pushed off the left edge.
 */
export function clampCrop(rect: CropRect, bounds: PixelSize): CropRect {
    const limitX = Math.max(1, Math.floor(bounds.width));
    const limitY = Math.max(1, Math.floor(bounds.height));

    const width = Math.max(
        Math.min(MIN_CROP_SIZE, limitX),
        Math.min(Math.round(rect.width), limitX),
    );
    const height = Math.max(
        Math.min(MIN_CROP_SIZE, limitY),
        Math.min(Math.round(rect.height), limitY),
    );

    return {
        x: Math.max(0, Math.min(Math.round(rect.x), limitX - width)),
        y: Math.max(0, Math.min(Math.round(rect.y), limitY - height)),
        width,
        height,
    };
}

/** Drags the whole box. It stops at the edges rather than shrinking against them. */
export function moveCrop(rect: CropRect, dx: number, dy: number, bounds: PixelSize): CropRect {
    return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds);
}

const HORIZONTAL: Record<CropHandle, "start" | "end" | "center"> = {
    nw: "end",
    n: "center",
    ne: "start",
    e: "start",
    se: "start",
    s: "center",
    sw: "end",
    w: "end",
};

const VERTICAL: Record<CropHandle, "start" | "end" | "center"> = {
    nw: "end",
    n: "end",
    ne: "end",
    e: "center",
    se: "start",
    s: "start",
    sw: "start",
    w: "center",
};

/**
 * Drags one handle to a point.
 *
 * Takes the pointer's position rather than a delta, because that is what a
 * drag actually knows and because accumulating deltas drifts: a pointer moved
 * out of the window and back would otherwise leave the box somewhere the
 * cursor is not.
 *
 * The rule is one sentence. **The side opposite the handle does not move**, and
 * for an edge handle the perpendicular axis stays centred where it was. That is
 * what makes a corner drag feel like dragging a corner, and it is what the
 * ratio lock and the bounds clamp are both expressed against.
 */
export function resizeCropTo(
    rect: CropRect,
    handle: CropHandle,
    pointer: PointerPoint,
    bounds: PixelSize,
    /** The quotient the box must keep, or `null` for a free drag. */
    ratio: number | null,
): CropRect {
    const xAnchor = anchorFor(HORIZONTAL[handle], rect.x, rect.width);
    const yAnchor = anchorFor(VERTICAL[handle], rect.y, rect.height);

    const wantedWidth = lengthTowards(xAnchor, pointer.x, rect.width);
    const wantedHeight = lengthTowards(yAnchor, pointer.y, rect.height);

    return buildRect(xAnchor, yAnchor, wantedWidth, wantedHeight, bounds, ratio);
}

function anchorFor(kind: "start" | "end" | "center", start: number, length: number): AxisAnchor {
    switch (kind) {
        case "start":
            return { kind: "start", at: start };
        case "end":
            return { kind: "end", at: start + length };
        case "center":
            return { kind: "center", at: start + length / 2 };
    }
}

/**
 * How long the box wants to be, given where the pointer is.
 *
 * A `center` axis is untouched by this handle, so it keeps the length it had —
 * dragging the north edge must not change the width, only what the ratio lock
 * afterwards makes of the new height.
 *
 * Crossing the anchor does not flip the box. The length goes to zero and stops,
 * which the minimum then lifts back to one pixel — a crop that inverts under
 * the cursor is a novelty, not a feature.
 */
function lengthTowards(anchor: AxisAnchor, pointer: number, current: number): number {
    switch (anchor.kind) {
        case "start":
            return Math.max(0, pointer - anchor.at);
        case "end":
            return Math.max(0, anchor.at - pointer);
        case "center":
            return current;
    }
}

/** How much room the box has on an axis before it leaves the picture. */
function roomFor(anchor: AxisAnchor, limit: number): number {
    switch (anchor.kind) {
        case "start":
            return Math.max(0, limit - anchor.at);
        case "end":
            return Math.max(0, anchor.at);
        case "center":
            // Symmetrical, so the binding side is whichever is nearer an edge.
            return Math.max(0, 2 * Math.min(anchor.at, limit - anchor.at));
    }
}

function positionFor(anchor: AxisAnchor, length: number): number {
    switch (anchor.kind) {
        case "start":
            return anchor.at;
        case "end":
            return anchor.at - length;
        case "center":
            return anchor.at - length / 2;
    }
}

/**
 * Turns a wanted size into a legal one.
 *
 * Two constraints pull against each other and the order matters. With a ratio
 * locked, both sides are scaled by **one** factor — first up, so neither side
 * is under the minimum, then down, so neither leaves the picture. Clamping the
 * axes independently is the bug this shape exists to avoid: it satisfies the
 * bounds and quietly breaks the ratio, which is exactly the moment the reader
 * was relying on it.
 */
function buildRect(
    xAnchor: AxisAnchor,
    yAnchor: AxisAnchor,
    wantedWidth: number,
    wantedHeight: number,
    bounds: PixelSize,
    ratio: number | null,
): CropRect {
    const roomX = roomFor(xAnchor, bounds.width);
    const roomY = roomFor(yAnchor, bounds.height);

    if (ratio === null) {
        return clampCrop(
            {
                x: positionFor(xAnchor, Math.min(wantedWidth, roomX)),
                y: positionFor(yAnchor, Math.min(wantedHeight, roomY)),
                width: Math.min(wantedWidth, roomX),
                height: Math.min(wantedHeight, roomY),
            },
            bounds,
        );
    }

    // The wanted size, made to obey the ratio by following whichever axis was
    // dragged further — so a corner drag chases the pointer rather than lagging
    // behind the axis that happened to move less.
    let width = Math.max(wantedWidth, wantedHeight * ratio);
    let height = width / ratio;

    const growth = Math.max(
        MIN_CROP_SIZE / Math.max(width, 1e-9),
        MIN_CROP_SIZE / Math.max(height, 1e-9),
        1,
    );

    width *= growth;
    height *= growth;

    const shrink = Math.min(roomX / Math.max(width, 1e-9), roomY / Math.max(height, 1e-9), 1);

    width *= shrink;
    height *= shrink;

    return clampCrop(
        {
            x: positionFor(xAnchor, width),
            y: positionFor(yAnchor, height),
            width,
            height,
        },
        bounds,
    );
}

/** The largest box of a given shape, centred in the picture. */
export function centeredCrop(bounds: PixelSize, ratio: number | null): CropRect {
    if (ratio === null) {
        return fullCrop(bounds);
    }

    return buildRect(
        { kind: "center", at: bounds.width / 2 },
        { kind: "center", at: bounds.height / 2 },
        bounds.width,
        bounds.height,
        bounds,
        ratio,
    );
}

/**
 * Re-shapes an existing crop to a new ratio, around its own centre.
 *
 * Inscribed rather than circumscribed: the new box fits **inside** what the
 * reader had. Switching the ratio picker from free to 1:1 must not quietly
 * take in more of the picture than was selected a moment ago — that reads as
 * the tool undoing the drag.
 */
export function applyRatio(rect: CropRect, ratio: number | null, bounds: PixelSize): CropRect {
    if (ratio === null) {
        return clampCrop(rect, bounds);
    }

    const byWidth = { width: rect.width, height: rect.width / ratio };
    const inscribed =
        byWidth.height <= rect.height
            ? byWidth
            : { width: rect.height * ratio, height: rect.height };

    return buildRect(
        { kind: "center", at: rect.x + rect.width / 2 },
        { kind: "center", at: rect.y + rect.height / 2 },
        inscribed.width,
        inscribed.height,
        bounds,
        ratio,
    );
}
