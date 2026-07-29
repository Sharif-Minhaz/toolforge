import { describe, expect, test } from "bun:test";

import { MIN_FEATHER_PX, MIN_REGION_SIDE } from "@/modules/watermark-remover/domain/constants";
import {
    featherRadius,
    measureMaskBounds,
    planRemovalRegion,
} from "@/modules/watermark-remover/domain/region";
import type { MaskStroke, PixelSize } from "@/modules/watermark-remover/types";

const SQUARE: PixelSize = { width: 1000, height: 1000 };

function dot(x: number, y: number, radius = 10): MaskStroke {
    return { radius, points: [{ x, y }] };
}

describe("measureMaskBounds", () => {
    test("reports nothing painted rather than a zero-area box", () => {
        expect(measureMaskBounds([], SQUARE)).toBeNull();
        expect(measureMaskBounds([{ radius: 10, points: [] }], SQUARE)).toBeNull();
    });

    test("inflates a single dab by the brush radius", () => {
        expect(measureMaskBounds([dot(100, 100)], SQUARE)).toEqual({
            left: 90,
            top: 90,
            right: 110,
            bottom: 110,
        });
    });

    test("clips a dab that hangs off the edge to the picture", () => {
        expect(measureMaskBounds([dot(5, 5)], SQUARE)).toEqual({
            left: 0,
            top: 0,
            right: 15,
            bottom: 15,
        });
    });

    test("unions every stroke, and every point inside them", () => {
        const strokes: readonly MaskStroke[] = [
            { radius: 5, points: [{ x: 200, y: 200 }] },
            {
                radius: 20,
                points: [
                    { x: 400, y: 300 },
                    { x: 500, y: 700 },
                ],
            },
        ];

        expect(measureMaskBounds(strokes, SQUARE)).toEqual({
            left: 195,
            top: 195,
            right: 520,
            bottom: 720,
        });
    });
});

describe("planRemovalRegion", () => {
    test("has nothing to plan when nothing was painted", () => {
        expect(planRemovalRegion([], SQUARE)).toBeNull();
    });

    test("floors a small mark at the minimum side so the model is not asked to upscale it", () => {
        // 20 px painted, padded to 36 — well under the floor.
        expect(planRemovalRegion([dot(500, 500)], SQUARE)).toEqual({
            x: 372,
            y: 372,
            side: MIN_REGION_SIDE,
        });
    });

    test("pulls a corner watermark's square back inside the picture", () => {
        const size: PixelSize = { width: 4000, height: 3000 };
        const region = planRemovalRegion([dot(3950, 2950, 20)], size);

        expect(region).toEqual({ x: 3744, y: 2744, side: MIN_REGION_SIDE });
        // Flush with the corner, never hanging off it.
        expect(region && region.x + region.side).toBe(size.width);
        expect(region && region.y + region.side).toBe(size.height);
    });

    test("caps the square at the shorter side for a mask that covers the frame", () => {
        const size: PixelSize = { width: 1000, height: 800 };
        const strokes: readonly MaskStroke[] = [
            {
                radius: 50,
                points: [
                    { x: 100, y: 100 },
                    { x: 900, y: 700 },
                ],
            },
        ];

        expect(planRemovalRegion(strokes, size)).toEqual({ x: 100, y: 0, side: 800 });
    });

    test("uses the shorter side when the picture is smaller than the minimum square", () => {
        const size: PixelSize = { width: 120, height: 90 };

        expect(planRemovalRegion([dot(60, 45, 5)], size)).toEqual({ x: 15, y: 0, side: 90 });
    });

    test("never plans a square that leaves the picture", () => {
        const size: PixelSize = { width: 640, height: 480 };
        const corners = [dot(0, 0), dot(640, 0), dot(0, 480), dot(640, 480), dot(320, 240)];

        for (const stroke of corners) {
            const region = planRemovalRegion([stroke], size);

            expect(region).not.toBeNull();
            expect(region?.x).toBeGreaterThanOrEqual(0);
            expect(region?.y).toBeGreaterThanOrEqual(0);
            expect((region?.x ?? 0) + (region?.side ?? 0)).toBeLessThanOrEqual(size.width);
            expect((region?.y ?? 0) + (region?.side ?? 0)).toBeLessThanOrEqual(size.height);
        }
    });
});

describe("featherRadius", () => {
    test("scales with the region so the blend looks the same at any crop size", () => {
        expect(featherRadius(256)).toBe(3);
        expect(featherRadius(512)).toBe(6);
        expect(featherRadius(800)).toBe(10);
    });

    test("never drops below the point where a fade becomes a seam", () => {
        expect(featherRadius(1)).toBe(MIN_FEATHER_PX);
        expect(featherRadius(100)).toBe(MIN_FEATHER_PX);
    });
});
