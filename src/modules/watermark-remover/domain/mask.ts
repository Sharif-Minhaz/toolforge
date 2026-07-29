import {
    BRUSH_SIZE_STEP,
    DEFAULT_BRUSH_SIZE,
    MAX_BRUSH_SIZE,
    MIN_BRUSH_SIZE,
    OVERLAY_MAX_SIDE,
} from "./constants";
import type { BoxRect, MaskStroke, PixelSize, Point } from "../types";

export type CaretDirection = "left" | "right" | "up" | "down";

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

/**
 * Keeps the brush inside its range and on the step grid.
 *
 * A value that is not a number at all falls back to the default rather than
 * poisoning every later stroke with `NaN` — the slider is one URL edit away from
 * handing over anything.
 */
export function clampBrushSize(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_BRUSH_SIZE;
    }

    const stepped = Math.round(value / BRUSH_SIZE_STEP) * BRUSH_SIZE_STEP;

    return clamp(stepped, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE);
}

/**
 * Turns a pointer position into image pixels.
 *
 * The preview renders the picture at its own aspect ratio with the canvas laid
 * exactly over it, so one scale factor covers both axes. Coordinates are clamped
 * to the picture: a drag that leaves the box should paint up to the edge, not
 * off it.
 */
export function mapToImagePoint(client: Point, rect: BoxRect, size: PixelSize): Point {
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0 };
    }

    return {
        x: clamp(((client.x - rect.left) * size.width) / rect.width, 0, size.width),
        y: clamp(((client.y - rect.top) * size.height) / rect.height, 0, size.height),
    };
}

/**
 * Converts a length the reader chose in display pixels — the brush diameter —
 * into the image's own pixels, so the same brush covers the same part of the
 * picture whatever the preview happens to be scaled to.
 *
 * Takes the width alone rather than a `PixelSize`: the preview keeps the
 * picture's aspect ratio, so one axis is the whole conversion.
 */
export function scaleToImage(length: number, rect: BoxRect, imageWidth: number): number {
    if (rect.width <= 0) {
        return length;
    }

    return (length * imageWidth) / rect.width;
}

/**
 * Adds a point to the stroke in progress, dropping one that lands on the
 * previous position. A held pointer emits events without moving, and a repeated
 * point is a wasted arc every time the mask is redrawn.
 */
export function appendStrokePoint(stroke: MaskStroke, point: Point): MaskStroke {
    const last = stroke.points.at(-1);

    if (last && last.x === point.x && last.y === point.y) {
        return stroke;
    }

    return { ...stroke, points: [...stroke.points, point] };
}

export function hasMaskCoverage(strokes: readonly MaskStroke[]): boolean {
    return strokes.some((stroke) => stroke.points.length > 0);
}

export function countMaskStrokes(strokes: readonly MaskStroke[]): number {
    return strokes.filter((stroke) => stroke.points.length > 0).length;
}

/** Undo, as one expression. An empty list stays empty rather than underflowing. */
export function dropLastStroke(strokes: readonly MaskStroke[]): readonly MaskStroke[] {
    return strokes.slice(0, -1);
}

/**
 * Moves the keyboard crosshair, clamped to the picture. The caret is what makes
 * the mask paintable without a pointer, so it may sit on the very edge — that is
 * where a watermark usually is.
 */
export function nudgeCaret(
    caret: Point,
    direction: CaretDirection,
    step: number,
    size: PixelSize,
): Point {
    const dx = direction === "left" ? -step : direction === "right" ? step : 0;
    const dy = direction === "up" ? -step : direction === "down" ? step : 0;

    return {
        x: clamp(caret.x + dx, 0, size.width),
        y: clamp(caret.y + dy, 0, size.height),
    };
}

/**
 * The size to give the overlay canvas: the picture's own, until that gets large
 * enough to be worth not allocating. Strokes are recorded in image pixels either
 * way, so shrinking the canvas costs a little crispness in the painted edge and
 * nothing at all in accuracy.
 */
export function fitOverlaySize(size: PixelSize, maxSide = OVERLAY_MAX_SIDE): PixelSize {
    const longest = Math.max(size.width, size.height);

    if (longest <= maxSide || longest === 0) {
        return size;
    }

    const scale = maxSide / longest;

    return {
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
    };
}
