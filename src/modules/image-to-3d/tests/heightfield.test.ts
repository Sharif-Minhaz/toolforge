import { describe, expect, test } from "bun:test";

import {
    buildHeightfield,
    colorsFromSamples,
    gridSizeFor,
    heightsFromSamples,
    resampleToGrid,
    smoothHeights,
} from "@/modules/image-to-3d/domain/heightfield";
import { MAX_RESOLUTION, MIN_RESOLUTION } from "@/modules/image-to-3d/domain/constants";
import { HEIGHT_SOURCES } from "@/modules/image-to-3d/types";

import { makeImage, rampImage, solidImage } from "./images";

describe("gridSizeFor", () => {
    test("puts the longest edge exactly where it was asked for", () => {
        expect(gridSizeFor({ width: 1600, height: 900 }, 64)).toEqual({ width: 64, height: 36 });
        expect(gridSizeFor({ width: 900, height: 1600 }, 64)).toEqual({ width: 36, height: 64 });
    });

    test("clamps to the range the steppers offer", () => {
        expect(gridSizeFor({ width: 100, height: 100 }, 1).width).toBe(MIN_RESOLUTION);
        expect(gridSizeFor({ width: 100, height: 100 }, 10_000).width).toBe(MAX_RESOLUTION);
    });

    test("never returns a grid with no cells in it", () => {
        // A 4000×1 banner is a legal PNG, and one row has no quads to build.
        const grid = gridSizeFor({ width: 4000, height: 1 }, 64);

        expect(grid.height).toBeGreaterThanOrEqual(2);
    });
});

describe("resampleToGrid", () => {
    test("keeps a solid colour exactly, whatever the grid", () => {
        const samples = resampleToGrid(solidImage(37, 23, [10, 200, 90, 255]), {
            width: 8,
            height: 5,
        });

        for (let index = 0; index < samples.length; index += 4) {
            expect(samples[index]).toBeCloseTo(10, 5);
            expect(samples[index + 1]).toBeCloseTo(200, 5);
            expect(samples[index + 2]).toBeCloseTo(90, 5);
            expect(samples[index + 3]).toBeCloseTo(255, 5);
        }
    });

    test("samples the corners at the corners, not half a cell in", () => {
        const samples = resampleToGrid(rampImage(64, 8), { width: 8, height: 4 });
        const last = (samples.length / 4 - 8 + 7) * 4;

        // The first column averages the picture's left edge and the last its
        // right, which is what makes the geometry line up with the texture.
        expect(samples[0]).toBeLessThan(20);
        expect(samples[last]).toBeGreaterThan(235);
    });

    test("composites over white before averaging, so a cut-out has no halo", () => {
        // Black pixels hidden behind zero alpha — the shape an encoder leaves
        // behind a transparent region. Averaged first they would drag the cell
        // toward black; composited first they vanish, as they do on screen.
        const image = makeImage(4, 1, (x) => (x < 2 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
        const samples = resampleToGrid(image, { width: 4, height: 1 });

        // Every cell reads white, including the two that are entirely black
        // underneath. Averaged before the composite the right-hand pair would
        // come out at zero.
        for (let index = 0; index < samples.length; index += 4) {
            expect(samples[index]).toBeCloseTo(255, 5);
        }

        // Alpha is the one channel that survives the composite untouched, which
        // is what leaves `source: "alpha"` able to see the cut-out at all.
        expect(samples[3]).toBeCloseTo(255, 5);
        expect(samples[15]).toBeCloseTo(0, 5);
    });
});

describe("heightsFromSamples", () => {
    const samples = Float32Array.from([255, 0, 0, 128]);

    test("reads the channel it was asked for", () => {
        expect(heightsFromSamples(samples, "red", false)[0]).toBeCloseTo(1, 5);
        expect(heightsFromSamples(samples, "green", false)[0]).toBeCloseTo(0, 5);
        expect(heightsFromSamples(samples, "blue", false)[0]).toBeCloseTo(0, 5);
        expect(heightsFromSamples(samples, "alpha", false)[0]).toBeCloseTo(128 / 255, 5);
        // Rec. 709 red, the same weight `filter: grayscale()` uses.
        expect(heightsFromSamples(samples, "luminance", false)[0]).toBeCloseTo(0.2126, 4);
    });

    test("inverting is the exact complement, for every source", () => {
        for (const source of HEIGHT_SOURCES) {
            const plain = heightsFromSamples(samples, source, false)[0];
            const inverted = heightsFromSamples(samples, source, true)[0];

            expect(plain + inverted).toBeCloseTo(1, 5);
        }
    });

    test("stays inside 0..1 for every source", () => {
        const extremes = Float32Array.from([255, 255, 255, 255, 0, 0, 0, 0]);

        for (const source of HEIGHT_SOURCES) {
            for (const height of heightsFromSamples(extremes, source, false)) {
                expect(height).toBeGreaterThanOrEqual(0);
                expect(height).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe("smoothHeights", () => {
    const grid = { width: 5, height: 5 };

    test("zero passes changes nothing, and still hands back its own array", () => {
        const heights = Float32Array.from({ length: 25 }, (_, index) => index / 25);
        const smoothed = smoothHeights(heights, grid, 0);

        expect([...smoothed]).toEqual([...heights]);
        expect(smoothed).not.toBe(heights);
    });

    test("leaves a flat field flat — a clamped edge does not pull it down", () => {
        const heights = new Float32Array(25).fill(0.4);

        for (const height of smoothHeights(heights, grid, 3)) {
            expect(height).toBeCloseTo(0.4, 6);
        }
    });

    test("pulls a single spike down and its neighbours up", () => {
        const heights = new Float32Array(25);

        heights[12] = 1;

        const smoothed = smoothHeights(heights, grid, 1);

        expect(smoothed[12]).toBeLessThan(1);
        expect(smoothed[11]).toBeGreaterThan(0);
        expect(smoothed[7]).toBeGreaterThan(0);
    });

    test("conserves the total, which is what makes it a blur and not a fade", () => {
        const heights = Float32Array.from({ length: 25 }, (_, index) => (index % 7) / 7);
        const before = heights.reduce((sum, value) => sum + value, 0);
        const after = smoothHeights(heights, grid, 2).reduce((sum, value) => sum + value, 0);

        // Clamped edges duplicate the border sample rather than inventing one,
        // so the sum is preserved to within the border's own rounding.
        expect(after).toBeCloseTo(before, 4);
    });
});

describe("colorsFromSamples", () => {
    test("rounds rather than truncates, so 254.6 is not 254", () => {
        expect([...colorsFromSamples(Float32Array.from([254.6, 0.4, 127.5, 255]))]).toEqual([
            255, 0, 128,
        ]);
    });
});

describe("buildHeightfield", () => {
    test("returns one height and one colour per grid point", () => {
        const field = buildHeightfield(rampImage(80, 40), {
            resolution: 40,
            source: "luminance",
            invert: false,
            smoothing: 1,
        });

        expect(field.columns).toBe(40);
        expect(field.rows).toBe(20);
        expect(field.heights.length).toBe(40 * 20);
        expect(field.colors.length).toBe(40 * 20 * 3);
    });

    test("a left-to-right ramp rises from left to right", () => {
        const field = buildHeightfield(rampImage(128, 32), {
            resolution: 32,
            source: "luminance",
            invert: false,
            smoothing: 0,
        });

        for (let column = 1; column < field.columns; column += 1) {
            expect(field.heights[column]).toBeGreaterThan(field.heights[column - 1]);
        }
    });
});
