import { describe, expect, test } from "bun:test";

import {
    addFrameSample,
    createFrameAccumulator,
    detectWatermark,
} from "@/modules/watermark-remover/domain/glyph-mask";
import { inpaintRegion, removeOverlay } from "@/modules/watermark-remover/domain/inpaint";
import { DETECT_SAMPLE_COUNT } from "@/modules/watermark-remover/domain/video-constants";

function rgba(values: readonly number[]): Uint8ClampedArray {
    const data = new Uint8ClampedArray(values.length * 4);

    values.forEach((value, index) => {
        data[index * 4] = value;
        data[index * 4 + 1] = value;
        data[index * 4 + 2] = value;
        data[index * 4 + 3] = 255;
    });

    return data;
}

function channel(data: Uint8ClampedArray, index: number): number {
    return data[index * 4] ?? 0;
}

describe("inpaintRegion", () => {
    test("reproduces a constant field exactly", () => {
        const size = 9;
        const data = rgba(Array.from({ length: size * size }, () => 137));
        const mask = new Uint8Array(size * size);

        for (let y = 3; y <= 5; y += 1) {
            for (let x = 3; x <= 5; x += 1) {
                mask[y * size + x] = 1;
                data[(y * size + x) * 4] = 255;
                data[(y * size + x) * 4 + 1] = 255;
                data[(y * size + x) * 4 + 2] = 255;
            }
        }

        inpaintRegion(data, size, size, mask);

        for (let index = 0; index < size * size; index += 1) {
            expect(channel(data, index)).toBe(137);
        }
    });

    test("recovers a linear ramp, which is the surface it solves for", () => {
        const size = 16;
        const truth = Array.from({ length: size * size }, (_, index) => {
            const x = index % size;
            const y = (index - x) / size;

            return 20 + 4 * x + 3 * y;
        });

        const data = rgba(truth);
        const mask = new Uint8Array(size * size);

        for (let y = 5; y <= 10; y += 1) {
            for (let x = 5; x <= 10; x += 1) {
                mask[y * size + x] = 1;
                data[(y * size + x) * 4] = 255;
                data[(y * size + x) * 4 + 1] = 255;
                data[(y * size + x) * 4 + 2] = 255;
            }
        }

        inpaintRegion(data, size, size, mask);

        for (let index = 0; index < size * size; index += 1) {
            if (mask[index] === 1) {
                expect(Math.abs(channel(data, index) - (truth[index] ?? 0))).toBeLessThanOrEqual(2);
            }
        }
    });

    test("writes nothing outside the mask, and never touches alpha", () => {
        const size = 8;
        const data = rgba(Array.from({ length: size * size }, (_, index) => index * 3));
        const before = Uint8ClampedArray.from(data);
        const mask = new Uint8Array(size * size);

        mask[3 * size + 3] = 1;
        mask[3 * size + 4] = 1;

        inpaintRegion(data, size, size, mask);

        for (let index = 0; index < size * size; index += 1) {
            expect(data[index * 4 + 3]).toBe(255);

            if (mask[index] !== 1) {
                expect(channel(data, index)).toBe(before[index * 4] ?? 0);
            }
        }
    });

    test("fills a mask that runs into the edge, from the sides that are left", () => {
        const size = 10;
        const data = rgba(Array.from({ length: size * size }, () => 90));
        const mask = new Uint8Array(size * size);

        for (let y = 0; y < 3; y += 1) {
            for (let x = 0; x < 3; x += 1) {
                mask[y * size + x] = 1;
                data[(y * size + x) * 4] = 250;
                data[(y * size + x) * 4 + 1] = 250;
                data[(y * size + x) * 4 + 2] = 250;
            }
        }

        inpaintRegion(data, size, size, mask);

        for (let index = 0; index < size * size; index += 1) {
            if (mask[index] === 1) {
                expect(channel(data, index)).toBe(90);
            }
        }
    });

    test("leaves the picture alone when nothing is marked", () => {
        const data = rgba([1, 2, 3, 4]);
        const before = Uint8ClampedArray.from(data);

        inpaintRegion(data, 2, 2, new Uint8Array(4));

        expect(Array.from(data)).toEqual(Array.from(before));
    });

    test("leaves the picture alone when everything is marked — there is nothing to read from", () => {
        const data = rgba([1, 2, 3, 4]);
        const before = Uint8ClampedArray.from(data);

        inpaintRegion(data, 2, 2, new Uint8Array(4).fill(1));

        expect(Array.from(data)).toEqual(Array.from(before));
    });
});

describe("removeOverlay", () => {
    test("recovers the exact pixel that was under a known overlay", () => {
        const size = 6;
        const truth = Array.from({ length: size * size }, (_, index) => 40 + index * 4);
        const covered = 0.6;

        const data = rgba(truth.map((value) => value * (1 - covered) + 255 * covered));
        const alpha = new Float32Array(size * size).fill(covered);

        removeOverlay(data, size, size, alpha, new Uint8Array(size * size));

        for (let index = 0; index < size * size; index += 1) {
            expect(Math.abs(channel(data, index) - (truth[index] ?? 0))).toBeLessThanOrEqual(2);
        }
    });

    test("leaves a pixel the mark never reached exactly as it was", () => {
        const data = rgba([10, 20, 30, 40]);
        const before = Uint8ClampedArray.from(data);

        removeOverlay(data, 2, 2, new Float32Array(4), new Uint8Array(4));

        expect(Array.from(data)).toEqual(Array.from(before));
    });

    test("rebuilds the solid core rather than dividing by almost nothing", () => {
        const size = 9;
        const data = rgba(Array.from({ length: size * size }, () => 120));
        const alpha = new Float32Array(size * size);
        const opaque = new Uint8Array(size * size);

        for (let y = 3; y <= 5; y += 1) {
            for (let x = 3; x <= 5; x += 1) {
                const index = y * size + x;

                alpha[index] = 1;
                opaque[index] = 1;
                data[index * 4] = 255;
                data[index * 4 + 1] = 255;
                data[index * 4 + 2] = 255;
            }
        }

        removeOverlay(data, size, size, alpha, opaque);

        for (let index = 0; index < size * size; index += 1) {
            expect(channel(data, index)).toBe(120);
        }
    });
});

/**
 * Detection and removal together, against the one thing neither of them is: the
 * frame as it would have been if nobody had signed it.
 *
 * The mark here is shaped like the one this tool exists for — a bright four-armed
 * core inside a wide, faint glow — because the first version of this pipeline
 * passed a test with no glow in it and then left a halo on the first real clip.
 * A synthetic mark with no falloff tests the easy half of the problem.
 */
describe("a sparkle with a glow, end to end", () => {
    const SIZE = 128;
    const CENTRE = 78;
    const ARM_SIGMA = 4;
    const GLOW_SIGMA = 9;
    const CORE_ALPHA = 0.95;
    const GLOW_ALPHA = 0.3;

    /** Opacity of the mark at one pixel: four thin arms, plus a halo around them. */
    const markAlpha = (x: number, y: number): number => {
        const dx = x - CENTRE;
        const dy = y - CENTRE;
        const distance = Math.hypot(dx, dy);
        const arm = Math.min(Math.abs(dx), Math.abs(dy));

        const arms =
            CORE_ALPHA *
            Math.exp(-(arm * arm) / 2) *
            Math.exp(-(distance * distance) / (2 * ARM_SIGMA * ARM_SIGMA));
        const glow = GLOW_ALPHA * Math.exp(-(distance * distance) / (2 * GLOW_SIGMA * GLOW_SIGMA));

        return Math.min(0.97, arms + glow);
    };

    const background = (x: number, y: number, index: number): number =>
        110 + 55 * Math.sin((x + y) * 0.012 + index * 0.7);

    const render = (index: number, marked: boolean): Uint8ClampedArray => {
        const values = Array.from({ length: SIZE * SIZE }, (_, offset) => {
            const x = offset % SIZE;
            const y = (offset - x) / SIZE;
            const base = background(x, y, index);

            if (!marked) {
                return base;
            }

            const covered = markAlpha(x, y);

            return base * (1 - covered) + 255 * covered;
        });

        return rgba(values);
    };

    test("takes the mark out and leaves the footage that was under it", () => {
        const accumulator = createFrameAccumulator(SIZE, SIZE);

        for (let index = 0; index < DETECT_SAMPLE_COUNT; index += 1) {
            addFrameSample(accumulator, render(index, true));
        }

        const detection = detectWatermark(accumulator);

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // The glow, not just the core: a pixel two thirds of the way out to the
        // halo's edge still carries the mark and has to be reached.
        expect(detection.profile.touched[(CENTRE + 12) * SIZE + CENTRE]).toBe(1);

        const frame = render(3, true);
        const truth = render(3, false);

        removeOverlay(frame, SIZE, SIZE, detection.profile.alpha, detection.profile.opaque);

        let worst = 0;
        let worstAtGlow = 0;

        for (let index = 0; index < SIZE * SIZE; index += 1) {
            const error = Math.abs(channel(frame, index) - channel(truth, index));
            const x = index % SIZE;
            const y = (index - x) / SIZE;
            const distance = Math.hypot(x - CENTRE, y - CENTRE);

            worst = Math.max(worst, error);

            if (distance > ARM_SIGMA * 2) {
                worstAtGlow = Math.max(worstAtGlow, error);
            }
        }

        // Away from the solid core the footage is *recovered*, not invented, so
        // the tolerance there is tight. The core itself is rebuilt from its
        // surroundings and is allowed to drift further.
        expect(worstAtGlow).toBeLessThanOrEqual(4);
        expect(worst).toBeLessThanOrEqual(6);
    });

    test("a one-threshold mask would have left the glow behind — this one does not", () => {
        const accumulator = createFrameAccumulator(SIZE, SIZE);

        for (let index = 0; index < DETECT_SAMPLE_COUNT; index += 1) {
            addFrameSample(accumulator, render(index, true));
        }

        const detection = detectWatermark(accumulator);

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // Every pixel the mark covers by more than a hundredth is accounted for.
        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                if (markAlpha(x, y) > 0.01) {
                    expect(detection.profile.touched[y * SIZE + x]).toBe(1);
                }
            }
        }
    });
});
