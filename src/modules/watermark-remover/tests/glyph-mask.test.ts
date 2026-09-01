import { describe, expect, test } from "bun:test";

import {
    addFrameSample,
    averageLuma,
    boxBlur,
    countMask,
    createFrameAccumulator,
    cropMask,
    detectWatermark,
    dilateMask,
    filledProfile,
    hysteresisMask,
    maskBounds,
} from "@/modules/watermark-remover/domain/glyph-mask";
import { DETECT_SAMPLE_COUNT } from "@/modules/watermark-remover/domain/video-constants";

const SIZE = 64;
const CENTRE = 40;
const ARM = 8;
const WATERMARK_ALPHA = 0.8;

/** A plus-shaped mark standing in for the sparkle: thin strokes, fixed position. */
function isMark(x: number, y: number): boolean {
    const dx = Math.abs(x - CENTRE);
    const dy = Math.abs(y - CENTRE);

    return (dx <= 1 && dy <= ARM) || (dy <= 1 && dx <= ARM);
}

/**
 * One frame of a clip whose footage moves under a mark that does not. The
 * gradient's period is far longer than the box, which is what a real corner of a
 * real frame looks like at this scale.
 */
function renderFrame(index: number, options: { marked: boolean; base: number }): Uint8ClampedArray {
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);

    for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
            const background = options.base + 55 * Math.sin((x + y) * 0.02 + index * 0.7);

            const value =
                options.marked && isMark(x, y)
                    ? background * (1 - WATERMARK_ALPHA) + 255 * WATERMARK_ALPHA
                    : background;

            const offset = (y * SIZE + x) * 4;

            data[offset] = value;
            data[offset + 1] = value;
            data[offset + 2] = value;
            data[offset + 3] = 255;
        }
    }

    return data;
}

function accumulate(options: { marked: boolean; base: number }) {
    const accumulator = createFrameAccumulator(SIZE, SIZE);

    for (let index = 0; index < DETECT_SAMPLE_COUNT; index += 1) {
        addFrameSample(accumulator, renderFrame(index, options));
    }

    return accumulator;
}

describe("boxBlur", () => {
    test("leaves a constant field alone", () => {
        const values = new Float32Array(8 * 8).fill(42);
        const blurred = boxBlur(values, 8, 8, 2);

        for (const value of blurred) {
            expect(value).toBeCloseTo(42, 4);
        }
    });

    test("reproduces a linear ramp away from the edges, which is what a background estimate needs", () => {
        const width = 32;
        const height = 32;
        const values = new Float32Array(width * height);

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                values[y * width + x] = 3 * x + 2 * y;
            }
        }

        const blurred = boxBlur(values, width, height, 3);

        for (let y = 6; y < height - 6; y += 1) {
            for (let x = 6; x < width - 6; x += 1) {
                expect(blurred[y * width + x]).toBeCloseTo(3 * x + 2 * y, 2);
            }
        }
    });

    test("a radius under one is a copy, not a crash", () => {
        const values = Float32Array.from([1, 2, 3, 4]);

        expect(Array.from(boxBlur(values, 2, 2, 0))).toEqual([1, 2, 3, 4]);
    });
});

describe("dilateMask", () => {
    test("grows a single pixel into a square of the radius", () => {
        const mask = new Uint8Array(7 * 7);

        mask[3 * 7 + 3] = 1;

        expect(countMask(dilateMask(mask, 7, 7, 1))).toBe(9);
        expect(countMask(dilateMask(mask, 7, 7, 2))).toBe(25);
    });

    test("clips at the edge instead of wrapping", () => {
        const mask = new Uint8Array(5 * 5);

        mask[0] = 1;

        const dilated = dilateMask(mask, 5, 5, 1);

        expect(countMask(dilated)).toBe(4);
        expect(dilated[4]).toBe(0);
    });

    test("a radius under one is a copy", () => {
        const mask = Uint8Array.from([0, 1, 0, 0]);

        expect(Array.from(dilateMask(mask, 2, 2, 0))).toEqual([0, 1, 0, 0]);
    });
});

describe("maskBounds", () => {
    test("is null when nothing is set", () => {
        expect(maskBounds(new Uint8Array(16), 4, 4)).toBeNull();
    });

    test("is the tight rectangle around what is set", () => {
        const mask = new Uint8Array(6 * 6);

        mask[1 * 6 + 2] = 1;
        mask[4 * 6 + 3] = 1;

        expect(maskBounds(mask, 6, 6)).toEqual({ x: 2, y: 1, width: 2, height: 4 });
    });
});

describe("cropMask", () => {
    test("takes the window in its own coordinates", () => {
        const mask = new Uint8Array(4 * 4);

        mask[1 * 4 + 1] = 1;

        expect(Array.from(cropMask(mask, 4, 4, { x: 1, y: 1, width: 2, height: 2 }))).toEqual([
            1, 0, 0, 0,
        ]);
    });

    test("reads zero rather than wrapping when the window hangs off the edge", () => {
        const mask = new Uint8Array(3 * 3).fill(1);
        const cropped = cropMask(mask, 3, 3, { x: 2, y: 2, width: 3, height: 3 });

        expect(Array.from(cropped)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    });
});

describe("averageLuma", () => {
    test("is all zeroes before any frame has been folded in", () => {
        const empty = averageLuma(createFrameAccumulator(2, 2));

        expect(Array.from(empty)).toEqual([0, 0, 0, 0]);
    });

    test("averages, rather than sums, what it was given", () => {
        const accumulator = createFrameAccumulator(1, 1);

        addFrameSample(accumulator, Uint8ClampedArray.from([0, 0, 0, 255]));
        addFrameSample(accumulator, Uint8ClampedArray.from([200, 200, 200, 255]));

        expect(averageLuma(accumulator)[0]).toBeCloseTo(100, 3);
    });

    test("keeps the channels apart, which is what the opacity estimate reads", () => {
        const accumulator = createFrameAccumulator(1, 1);

        addFrameSample(accumulator, Uint8ClampedArray.from([200, 100, 0, 255]));
        addFrameSample(accumulator, Uint8ClampedArray.from([0, 100, 200, 255]));

        expect(averageLuma(accumulator)[0]).toBeCloseTo(0.299 * 100 + 0.587 * 100 + 0.114 * 100, 3);
    });
});

describe("hysteresisMask", () => {
    test("keeps a faint tail that is connected to a bright core", () => {
        // A bright pixel with a fading trail: one threshold would cut the trail
        // off, two thresholds follow it to the end.
        const values = Float32Array.from([10, 4, 3, 2, 1.5]);
        const mask = hysteresisMask(values, 5, 1, 8, 1);

        expect(Array.from(mask)).toEqual([1, 1, 1, 1, 1]);
    });

    test("drops a faint pixel that no core reaches", () => {
        const values = Float32Array.from([10, 0, 3, 0, 3]);
        const mask = hysteresisMask(values, 5, 1, 8, 1);

        expect(Array.from(mask)).toEqual([1, 0, 0, 0, 0]);
    });

    test("finds nothing when nothing clears the seed threshold", () => {
        const values = Float32Array.from([3, 3, 3, 3]);

        expect(countMask(hysteresisMask(values, 4, 1, 8, 1))).toBe(0);
    });
});

describe("detectWatermark", () => {
    test("finds a mark that stays put while the footage under it moves", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100 }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // Every stroke of the mark is reached…
        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                if (isMark(x, y)) {
                    expect(detection.profile.touched[y * SIZE + x]).toBe(1);
                }
            }
        }

        // …and the rest of the corner is left alone.
        expect(detection.profile.coverage).toBeLessThan(0.2);
    });

    test("estimates how strongly the mark covers each pixel", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100 }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // The synthetic mark is laid on at a known opacity, and the estimate has
        // to come back near it — this number is what the un-blend divides by.
        expect(detection.profile.alpha[CENTRE * SIZE + CENTRE]).toBeCloseTo(WATERMARK_ALPHA, 1);

        // Well outside the mark there is nothing to un-blend.
        expect(detection.profile.alpha[2 * SIZE + 2]).toBe(0);
    });

    test("finds the same mark over a bright corner as over a dark one", () => {
        for (const base of [60, 100, 170]) {
            const detection = detectWatermark(accumulate({ marked: true, base }));

            expect(detection.ok).toBe(true);

            if (detection.ok) {
                expect(detection.profile.touched[CENTRE * SIZE + CENTRE]).toBe(1);
                expect(detection.profile.alpha[CENTRE * SIZE + CENTRE]).toBeCloseTo(
                    WATERMARK_ALPHA,
                    1,
                );
            }
        }
    });

    test("refuses a corner with nothing standing in it", () => {
        expect(detectWatermark(accumulate({ marked: false, base: 100 }))).toEqual({
            ok: false,
            reason: "mark_not_found",
        });
    });

    test("refuses before a single frame has been folded in", () => {
        expect(detectWatermark(createFrameAccumulator(SIZE, SIZE))).toEqual({
            ok: false,
            reason: "mark_not_found",
        });
    });

    test("refuses a box too small to hold a mark and its surroundings", () => {
        const tiny = createFrameAccumulator(2, 2);

        addFrameSample(tiny, new Uint8ClampedArray(16).fill(255));

        expect(detectWatermark(tiny)).toEqual({ ok: false, reason: "mark_not_found" });
    });
});

describe("filledProfile", () => {
    test("is the escape hatch: every pixel solid, nothing to un-blend", () => {
        const profile = filledProfile(3, 4);

        expect(countMask(profile.opaque)).toBe(12);
        expect(countMask(profile.touched)).toBe(12);
        expect(Array.from(profile.alpha).every((value) => value === 1)).toBe(true);
        expect(maskBounds(profile.touched, 3, 4)).toEqual({ x: 0, y: 0, width: 3, height: 4 });
    });
});
