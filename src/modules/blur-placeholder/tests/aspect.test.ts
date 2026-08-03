import { describe, expect, test } from "bun:test";

import {
    COMPONENT_BUDGET,
    fitComponents,
    parseAspectRatio,
    placeholderSize,
    targetShape,
} from "@/modules/blur-placeholder/domain/aspect";
import { MAX_COMPONENTS, MIN_COMPONENTS } from "@/modules/blur-placeholder/domain/constants";
import { ASPECT_RATIOS } from "@/modules/blur-placeholder/types";

describe("parseAspectRatio", () => {
    test("splits every ratio the picker offers into two positive numbers", () => {
        for (const ratio of ASPECT_RATIOS) {
            const shape = parseAspectRatio(ratio);

            expect(shape.width).toBeGreaterThan(0);
            expect(shape.height).toBeGreaterThan(0);
            expect(`${shape.width}:${shape.height}`).toBe(ratio);
        }
    });
});

describe("placeholderSize", () => {
    test("puts the longest edge exactly where it was asked for", () => {
        expect(placeholderSize({ width: 1600, height: 900 }, 32)).toEqual({
            width: 32,
            height: 18,
        });
        expect(placeholderSize({ width: 900, height: 1600 }, 32)).toEqual({
            width: 18,
            height: 32,
        });
    });

    test("enlarges as well as shrinks, because a hash has no resolution", () => {
        expect(placeholderSize({ width: 4, height: 3 }, 64)).toEqual({ width: 64, height: 48 });
    });

    test("keeps a square square", () => {
        expect(placeholderSize({ width: 500, height: 500 }, 24)).toEqual({
            width: 24,
            height: 24,
        });
    });

    test("floors the short edge at one pixel so a panorama still decodes", () => {
        expect(placeholderSize({ width: 8000, height: 100 }, 16)).toEqual({
            width: 16,
            height: 1,
        });
    });

    test("degrades to a single pixel rather than dividing by zero", () => {
        expect(placeholderSize({ width: 0, height: 0 }, 32)).toEqual({ width: 1, height: 1 });
        expect(placeholderSize({ width: 16, height: 9 }, 0)).toEqual({ width: 1, height: 1 });
    });
});

describe("fitComponents", () => {
    test("stays inside the format's range and the budget", () => {
        for (const [width, height] of [
            [1920, 1080],
            [1, 4000],
            [4000, 1],
            [800, 800],
            [3, 4],
        ] as const) {
            const { componentX, componentY } = fitComponents({ width, height });

            expect(componentX).toBeGreaterThanOrEqual(MIN_COMPONENTS);
            expect(componentY).toBeGreaterThanOrEqual(MIN_COMPONENTS);
            expect(componentX).toBeLessThanOrEqual(MAX_COMPONENTS);
            expect(componentY).toBeLessThanOrEqual(MAX_COMPONENTS);
            expect(componentX * componentY).toBeLessThanOrEqual(COMPONENT_BUDGET);
        }
    });

    test("gives a square picture a square grid", () => {
        const { componentX, componentY } = fitComponents({ width: 640, height: 640 });

        expect(componentX).toBe(componentY);
    });

    test("keeps a fitted hash inside 60 characters", () => {
        for (const [width, height] of [
            [1920, 1080],
            [1200, 630],
            [1080, 1350],
            [4000, 400],
        ] as const) {
            const { componentX, componentY } = fitComponents({ width, height });

            expect(4 + 2 * componentX * componentY).toBeLessThanOrEqual(60);
        }
    });

    test("spends the coefficients along the picture's long side", () => {
        const wide = fitComponents({ width: 1600, height: 900 });

        expect(wide.componentX).toBeGreaterThan(wide.componentY);
    });

    test("mirrors the grid when the picture is rotated", () => {
        const landscape = fitComponents({ width: 1600, height: 900 });
        const portrait = fitComponents({ width: 900, height: 1600 });

        expect(portrait).toEqual({
            componentX: landscape.componentY,
            componentY: landscape.componentX,
        });
    });

    test("beats the flat 4 × 3 default on a wide picture", () => {
        // The whole point: a 16:9 photograph was spending vertical coefficients
        // on detail that is not there.
        const { componentX, componentY } = fitComponents({ width: 1920, height: 1080 });

        expect(componentX * componentY).toBeGreaterThan(12);
    });

    test("degrades to a square grid for a zero-sized shape", () => {
        const { componentX, componentY } = fitComponents({ width: 0, height: 0 });

        expect(componentX).toBe(componentY);
        expect(componentX).toBeGreaterThan(1);
    });

    test("honours a smaller budget", () => {
        const { componentX, componentY } = fitComponents({ width: 1600, height: 900 }, 6);

        expect(componentX * componentY).toBeLessThanOrEqual(6);
    });
});

describe("targetShape", () => {
    test("prefers the picture's own shape when there is one", () => {
        expect(targetShape({ width: 1200, height: 675 }, "1:1")).toEqual({
            width: 1200,
            height: 675,
        });
    });

    test("falls back to the picked ratio when decoding a bare hash", () => {
        expect(targetShape(null, "16:9")).toEqual({ width: 16, height: 9 });
    });

    test("treats a degenerate source as no source at all", () => {
        expect(targetShape({ width: 0, height: 400 }, "4:3")).toEqual({ width: 4, height: 3 });
    });
});
