import { describe, expect, test } from "bun:test";

import {
    DEFAULT_BRUSH_SIZE,
    MAX_BRUSH_SIZE,
    MIN_BRUSH_SIZE,
    OVERLAY_MAX_SIDE,
} from "@/modules/watermark-remover/domain/constants";
import {
    appendStrokePoint,
    clampBrushSize,
    countMaskStrokes,
    dropLastStroke,
    fitOverlaySize,
    hasMaskCoverage,
    mapToImagePoint,
    nudgeCaret,
    scaleToImage,
} from "@/modules/watermark-remover/domain/mask";
import type { BoxRect, MaskStroke, PixelSize } from "@/modules/watermark-remover/types";

const RECT: BoxRect = { left: 10, top: 20, width: 400, height: 300 };
const SIZE: PixelSize = { width: 800, height: 600 };

describe("clampBrushSize", () => {
    const cases: readonly (readonly [number, number])[] = [
        [DEFAULT_BRUSH_SIZE, DEFAULT_BRUSH_SIZE],
        [29, 30],
        [7, 8],
        [0, MIN_BRUSH_SIZE],
        [-5, MIN_BRUSH_SIZE],
        [1000, MAX_BRUSH_SIZE],
    ];

    for (const [input, expected] of cases) {
        test(`maps ${input} to ${expected}`, () => {
            expect(clampBrushSize(input)).toBe(expected);
        });
    }

    test("falls back to the default rather than spreading NaN into every stroke", () => {
        expect(clampBrushSize(Number.NaN)).toBe(DEFAULT_BRUSH_SIZE);
        expect(clampBrushSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_BRUSH_SIZE);
    });

    test("always lands inside the range", () => {
        for (const value of [-100, 1, 5, 6, 7, 50, 95, 96, 97, 500]) {
            const clamped = clampBrushSize(value);

            expect(clamped).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE);
            expect(clamped).toBeLessThanOrEqual(MAX_BRUSH_SIZE);
        }
    });
});

describe("mapToImagePoint", () => {
    test("maps the box's top-left corner to the picture's origin", () => {
        expect(mapToImagePoint({ x: 10, y: 20 }, RECT, SIZE)).toEqual({ x: 0, y: 0 });
    });

    test("scales a position in the middle of the box by the preview's factor", () => {
        expect(mapToImagePoint({ x: 210, y: 170 }, RECT, SIZE)).toEqual({ x: 400, y: 300 });
    });

    test("maps the bottom-right corner to the last pixel", () => {
        expect(mapToImagePoint({ x: 410, y: 320 }, RECT, SIZE)).toEqual({ x: 800, y: 600 });
    });

    test("clamps a drag that left the box to the edge of the picture", () => {
        expect(mapToImagePoint({ x: -500, y: -500 }, RECT, SIZE)).toEqual({ x: 0, y: 0 });
        expect(mapToImagePoint({ x: 5_000, y: 5_000 }, RECT, SIZE)).toEqual({ x: 800, y: 600 });
    });

    test("answers the origin for a box with no size instead of dividing by zero", () => {
        const collapsed: BoxRect = { left: 0, top: 0, width: 0, height: 0 };

        expect(mapToImagePoint({ x: 40, y: 40 }, collapsed, SIZE)).toEqual({ x: 0, y: 0 });
    });
});

describe("scaleToImage", () => {
    test("converts a display length into the picture's own pixels", () => {
        expect(scaleToImage(28, RECT, SIZE.width)).toBe(56);
    });

    test("leaves the length alone when the box has no width to scale from", () => {
        expect(scaleToImage(28, { left: 0, top: 0, width: 0, height: 0 }, SIZE.width)).toBe(28);
    });
});

describe("appendStrokePoint", () => {
    const stroke: MaskStroke = { radius: 10, points: [{ x: 5, y: 5 }] };

    test("adds a point that moved", () => {
        expect(appendStrokePoint(stroke, { x: 6, y: 5 }).points).toEqual([
            { x: 5, y: 5 },
            { x: 6, y: 5 },
        ]);
    });

    test("drops a point that landed exactly where the last one did", () => {
        // A held pointer keeps emitting events; a repeated point is a wasted arc
        // on every redraw.
        expect(appendStrokePoint(stroke, { x: 5, y: 5 })).toBe(stroke);
    });

    test("keeps the radius the stroke started with", () => {
        expect(appendStrokePoint(stroke, { x: 9, y: 9 }).radius).toBe(10);
    });

    test("starts an empty stroke off with its first point", () => {
        expect(appendStrokePoint({ radius: 4, points: [] }, { x: 1, y: 2 }).points).toEqual([
            { x: 1, y: 2 },
        ]);
    });
});

describe("mask bookkeeping", () => {
    const painted: MaskStroke = { radius: 8, points: [{ x: 1, y: 1 }] };
    const empty: MaskStroke = { radius: 8, points: [] };

    test("reports no coverage for no strokes at all", () => {
        expect(hasMaskCoverage([])).toBe(false);
    });

    test("reports no coverage for a stroke that never got a point", () => {
        expect(hasMaskCoverage([empty])).toBe(false);
    });

    test("reports coverage as soon as one stroke has a point", () => {
        expect(hasMaskCoverage([empty, painted])).toBe(true);
    });

    test("counts only the strokes that actually painted something", () => {
        expect(countMaskStrokes([painted, empty, painted])).toBe(2);
    });

    test("undo removes the last stroke", () => {
        expect(dropLastStroke([painted, empty])).toEqual([painted]);
    });

    test("undo on an empty list stays empty rather than underflowing", () => {
        expect(dropLastStroke([])).toEqual([]);
    });
});

describe("nudgeCaret", () => {
    const centre = { x: 400, y: 300 };

    test("moves one step along each axis", () => {
        expect(nudgeCaret(centre, "left", 16, SIZE)).toEqual({ x: 384, y: 300 });
        expect(nudgeCaret(centre, "right", 16, SIZE)).toEqual({ x: 416, y: 300 });
        expect(nudgeCaret(centre, "up", 16, SIZE)).toEqual({ x: 400, y: 284 });
        expect(nudgeCaret(centre, "down", 16, SIZE)).toEqual({ x: 400, y: 316 });
    });

    test("stops at the edge, which is where a watermark usually is", () => {
        expect(nudgeCaret({ x: 4, y: 4 }, "left", 100, SIZE)).toEqual({ x: 0, y: 4 });
        expect(nudgeCaret({ x: 4, y: 4 }, "up", 100, SIZE)).toEqual({ x: 4, y: 0 });
        expect(nudgeCaret({ x: 790, y: 590 }, "right", 100, SIZE)).toEqual({ x: 800, y: 590 });
        expect(nudgeCaret({ x: 790, y: 590 }, "down", 100, SIZE)).toEqual({ x: 790, y: 600 });
    });
});

describe("fitOverlaySize", () => {
    test("leaves a picture that already fits alone", () => {
        expect(fitOverlaySize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    });

    test("scales a large picture down by its longer side, keeping the aspect ratio", () => {
        expect(fitOverlaySize({ width: 4000, height: 3000 })).toEqual({
            width: OVERLAY_MAX_SIDE,
            height: 960,
        });
    });

    test("scales by height when that is the longer side", () => {
        expect(fitOverlaySize({ width: 1000, height: 4000 })).toEqual({
            width: 320,
            height: OVERLAY_MAX_SIDE,
        });
    });

    test("never rounds a sliver of an image down to nothing", () => {
        expect(fitOverlaySize({ width: 10_000, height: 3 })).toEqual({
            width: OVERLAY_MAX_SIDE,
            height: 1,
        });
    });

    test("hands back a zero-sized picture untouched rather than dividing by zero", () => {
        expect(fitOverlaySize({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
    });
});
