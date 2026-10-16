import { describe, expect, test } from "bun:test";

import {
    distanceInInches,
    measureDpi,
    MIN_DPI_COUNTS,
    nearestCommonDpi,
    summarizeStages,
} from "@/modules/mouse-tester/domain/dpi";

describe("measureDpi", () => {
    test("divides counts by inches", () => {
        // 10 cm is 3.937 in; 6299 counts across it is 1600 DPI.
        const result = measureDpi(6299, 0, 10, "cm");

        expect(result.ok).toBe(true);
        expect(result.ok && result.dpi).toBeCloseTo(1600, 0);
        expect(measureDpi(0, -3200, 4, "in")).toEqual({ ok: true, dpi: 800, counts: 3200 });
    });

    test("uses displacement, so a swipe at an angle still counts in full", () => {
        const result = measureDpi(3000, 4000, 5, "in");

        expect(result).toEqual({ ok: true, dpi: 1000, counts: 5000 });
    });

    test("refuses a swipe too short to read and a distance off the ruler", () => {
        expect(measureDpi(MIN_DPI_COUNTS - 1, 0, 2, "cm")).toEqual({
            ok: false,
            reason: "too_short",
        });
        expect(measureDpi(5000, 0, 0.5, "in")).toEqual({ ok: false, reason: "invalid_distance" });
        expect(measureDpi(5000, 0, Number.NaN, "cm")).toEqual({
            ok: false,
            reason: "invalid_distance",
        });
    });

    test("converts centimetres exactly", () => {
        expect(distanceInInches(2.54, "cm")).toBe(1);
        expect(distanceInInches(3, "in")).toBe(3);
    });
});

describe("nearestCommonDpi", () => {
    test("names a reading after the setting it is close to", () => {
        expect(nearestCommonDpi(1572)).toBe(1600);
        expect(nearestCommonDpi(812)).toBe(800);
    });

    test("names nothing when it is between settings", () => {
        expect(nearestCommonDpi(300)).toBeNull();
    });
});

describe("summarizeStages", () => {
    test("averages each stage and compares it with the last", () => {
        const stages = summarizeStages([
            { stage: 1, dpi: 790 },
            { stage: 1, dpi: 810 },
            { stage: 2, dpi: 1600 },
        ]);

        expect(stages).toHaveLength(2);
        expect(stages[0]).toMatchObject({ stage: 1, dpi: 800, swipes: 2, ratio: null });
        expect(stages[0].spread).toBeCloseTo(0.025);
        expect(stages[1]).toMatchObject({ dpi: 1600, ratio: 2, unchanged: false, nearest: 1600 });
    });

    test("flags a stage that reads the same as the one before", () => {
        const stages = summarizeStages([
            { stage: 1, dpi: 1600 },
            { stage: 2, dpi: 1630 },
        ]);

        expect(stages[1].unchanged).toBe(true);
    });

    test("orders stages however the readings arrived", () => {
        const stages = summarizeStages([
            { stage: 2, dpi: 3200 },
            { stage: 1, dpi: 1600 },
        ]);

        expect(stages.map((stage) => stage.stage)).toEqual([1, 2]);
    });
});
