import { describe, expect, test } from "bun:test";

import {
    MAX_DRAWN_PITCHES,
    PITCH_LENGTH_METERS,
    PITCH_WIDTH_METERS,
} from "@/modules/land-measurement/domain/constants";
import {
    comparePitches,
    PITCH_AREA_SQUARE_METERS,
    plotShape,
} from "@/modules/land-measurement/domain/pitch";

describe("comparePitches", () => {
    test("a pitch is 7,140 m²", () => {
        expect(PITCH_AREA_SQUARE_METERS).toBe(7_140);
    });

    test("a plot smaller than a pitch is one pitch with a square in the middle", () => {
        const quarter = comparePitches(PITCH_AREA_SQUARE_METERS / 4);

        expect(quarter.ratio).toBeCloseTo(0.25, 12);
        expect(quarter.fullPitches).toBe(0);
        expect(quarter.drawnPitches).toBe(1);
        expect(quarter.truncated).toBe(false);
        expect(quarter.remainder?.kind).toBe("square");

        const side = Math.sqrt(PITCH_AREA_SQUARE_METERS / 4);
        expect(quarter.remainder?.width).toBeCloseTo(side, 9);
        expect(quarter.remainder?.x).toBeCloseTo((PITCH_LENGTH_METERS - side) / 2, 9);
        expect(quarter.remainder?.y).toBeCloseTo((PITCH_WIDTH_METERS - side) / 2, 9);
    });

    test("three and a half pitches draw three full ones and a half", () => {
        const comparison = comparePitches(PITCH_AREA_SQUARE_METERS * 3.5);

        expect(comparison.fullPitches).toBe(3);
        expect(comparison.drawnPitches).toBe(4);
        // Half a pitch is 59.7 m a side, which still fits between the touchlines.
        expect(comparison.remainder?.kind).toBe("square");
        expect(comparison.remainder?.width).toBeCloseTo(Math.sqrt(PITCH_AREA_SQUARE_METERS / 2), 9);
    });

    test("an area a hair short of two pitches after rounding is two pitches, not one and a sliver", () => {
        const comparison = comparePitches(PITCH_AREA_SQUARE_METERS * 2 * (1 - 1e-12));

        expect(comparison.ratio).toBe(2);
        expect(comparison.fullPitches).toBe(2);
        expect(comparison.drawnPitches).toBe(2);
        expect(comparison.remainder).toBeNull();
    });

    test("stops drawing at the cap and says so", () => {
        const comparison = comparePitches(PITCH_AREA_SQUARE_METERS * 500.5);

        expect(comparison.fullPitches).toBe(500);
        expect(comparison.drawnPitches).toBe(MAX_DRAWN_PITCHES);
        expect(comparison.truncated).toBe(true);
        expect(comparison.remainder).toBeNull();
    });

    test("an empty plot still draws the pitch it is compared against", () => {
        expect(comparePitches(0)).toEqual({
            ratio: 0,
            fullPitches: 0,
            drawnPitches: 1,
            remainder: null,
            truncated: false,
        });
    });
});

describe("plotShape", () => {
    test("stays a square while it fits between the touchlines", () => {
        const widest = plotShape(PITCH_WIDTH_METERS ** 2);

        expect(widest.kind).toBe("square");
        expect(widest.height).toBeCloseTo(PITCH_WIDTH_METERS, 9);
    });

    test("becomes a full-width strip past that, with the same area", () => {
        const area = PITCH_AREA_SQUARE_METERS * 0.8;
        const strip = plotShape(area);

        expect(strip.kind).toBe("strip");
        expect(strip.y).toBe(0);
        expect(strip.height).toBe(PITCH_WIDTH_METERS);
        expect(strip.width * strip.height).toBeCloseTo(area, 9);
    });
});
