import { describe, expect, test } from "bun:test";

import {
    addFrameSample,
    createFrameAccumulator,
    detectWatermark,
} from "@/modules/watermark-remover/domain/glyph-mask";
import {
    inpaintRegion,
    rebuildHoles,
    relaxationPassesFor,
    removeOverlay,
} from "@/modules/watermark-remover/domain/inpaint";
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

    test("carries a gradient across a hole far wider than the default pass count", () => {
        // The background estimate interpolates across the *whole* mark, glow
        // included, which on a real clip is a hole a hundred pixels across. A
        // sweep that lands on the neighbour average converges in about the
        // square of that, so the middle sags toward the average of the rim — and
        // over a corner with a gradient, a background estimate that sags is an
        // opacity that is too high and a mark-shaped patch subtracted out of the
        // frame. This is the test that says the sag is gone.
        const size = 100;
        const hole = 60;
        const start = (size - hole) / 2;

        const truth = Array.from({ length: size * size }, (_, index) => {
            const x = index % size;
            const y = (index - x) / size;

            return 30 + 1.6 * x + 0.4 * y;
        });

        const data = rgba(truth);
        const mask = new Uint8Array(size * size);

        for (let y = start; y < start + hole; y += 1) {
            for (let x = start; x < start + hole; x += 1) {
                const index = y * size + x;

                mask[index] = 1;
                data[index * 4] = 0;
                data[index * 4 + 1] = 0;
                data[index * 4 + 2] = 0;
            }
        }

        inpaintRegion(data, size, size, mask, relaxationPassesFor(hole));

        let worst = 0;

        for (let index = 0; index < size * size; index += 1) {
            if (mask[index] === 1) {
                worst = Math.max(worst, Math.abs(channel(data, index) - (truth[index] ?? 0)));
            }
        }

        expect(worst).toBeLessThanOrEqual(3);
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

        removeOverlay(data, size, size, alpha, new Float32Array(size * size));

        for (let index = 0; index < size * size; index += 1) {
            expect(Math.abs(channel(data, index) - (truth[index] ?? 0))).toBeLessThanOrEqual(2);
        }
    });

    test("never subtracts more white than the pixel could be holding", () => {
        // The estimate says three quarters covered; the pixel says otherwise —
        // it is at 60, so at most 60/255 of it can be white that was added. The
        // old code took the estimate at its word, drove the channels negative,
        // and clamped them to black. That is the dark blotch.
        const data = rgba([60, 60, 60, 60]);
        const alpha = new Float32Array(4).fill(0.75);

        removeOverlay(data, 2, 2, alpha, new Float32Array(4));

        for (let index = 0; index < 4; index += 1) {
            expect(channel(data, index)).toBeGreaterThanOrEqual(0);
            expect(channel(data, index)).toBeLessThanOrEqual(60);
        }
    });

    test("does not hand back amplified noise where the mark was thick", () => {
        // Dividing by `1 − a` multiplies every error in the observed pixel by
        // `1 / (1 − a)`. At nine tenths covered that is ten times, so a
        // compressed frame's ordinary noise comes back as visible grain in the
        // exact shape of the mark. Past half covered the pixel is rebuilt from
        // its surroundings instead, and the point of this test is that the
        // result is smooth rather than faithful-but-grainy.
        const size = 15;
        const truth = 130;
        const covered = 0.9;

        // A flat field under the mark, plus a level of noise on every pixel.
        const data = rgba(
            Array.from({ length: size * size }, (_, index) => {
                const noise = index % 3 === 0 ? 2 : index % 3 === 1 ? -2 : 0;

                return truth * (1 - covered) + 255 * covered + noise;
            }),
        );

        const alpha = new Float32Array(size * size).fill(covered);
        const rebuild = new Float32Array(size * size).fill(1);

        // A ring of clean footage for the rebuild to read from.
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                if (x >= 3 && x < size - 3 && y >= 3 && y < size - 3) {
                    continue;
                }

                const index = y * size + x;

                alpha[index] = 0;
                rebuild[index] = 0;
                data[index * 4] = truth;
                data[index * 4 + 1] = truth;
                data[index * 4 + 2] = truth;
            }
        }

        removeOverlay(data, size, size, alpha, rebuild, relaxationPassesFor(size));

        let roughest = 0;

        for (let y = 4; y < size - 4; y += 1) {
            for (let x = 4; x < size - 4; x += 1) {
                const here = channel(data, y * size + x);

                roughest = Math.max(
                    roughest,
                    Math.abs(here - channel(data, y * size + x + 1)),
                    Math.abs(here - channel(data, (y + 1) * size + x)),
                );
            }
        }

        // Un-blended at ten-times amplification, the four-level swing in the
        // input would come back as forty. Rebuilt, the patch is flat.
        expect(roughest).toBeLessThanOrEqual(2);
    });

    test("leaves a pixel the mark never reached exactly as it was", () => {
        const data = rgba([10, 20, 30, 40]);
        const before = Uint8ClampedArray.from(data);

        removeOverlay(data, 2, 2, new Float32Array(4), new Float32Array(4));

        expect(Array.from(data)).toEqual(Array.from(before));
    });

    test("rebuilds the solid core rather than dividing by almost nothing", () => {
        const size = 9;
        const data = rgba(Array.from({ length: size * size }, () => 120));
        const alpha = new Float32Array(size * size);
        const rebuild = new Float32Array(size * size);

        for (let y = 3; y <= 5; y += 1) {
            for (let x = 3; x <= 5; x += 1) {
                const index = y * size + x;

                alpha[index] = 1;
                rebuild[index] = 1;
                data[index * 4] = 255;
                data[index * 4 + 1] = 255;
                data[index * 4 + 2] = 255;
            }
        }

        removeOverlay(data, size, size, alpha, rebuild);

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
describe("rebuildHoles", () => {
    test("reaches out past every pixel the rebuild will actually change", () => {
        // Weight zero, opacity well above the border: interpolated, then thrown
        // away. That ring is the whole point — it is what the fill reads from.
        const alpha = Float32Array.from([0, 0.02, 0.4, 0.9, 0.4, 0.02, 0]);
        const rebuild = Float32Array.from([0, 0, 0, 1, 0, 0, 0]);

        expect(Array.from(rebuildHoles(alpha, rebuild))).toEqual([0, 0, 1, 1, 1, 0, 0]);
    });

    test("still holds every pixel the rebuild does change, however faint the mark is there", () => {
        const alpha = Float32Array.from([0, 0.01, 0.01, 0]);
        const rebuild = Float32Array.from([0, 0, 0.5, 0]);

        expect(Array.from(rebuildHoles(alpha, rebuild))).toEqual([0, 0, 1, 0]);
    });
});

describe("removing an overlay can only darken", () => {
    test("never returns a pixel brighter than the one it was given", () => {
        const SIZE = 33;
        const frame = new Uint8ClampedArray(SIZE * SIZE * 4);
        const alpha = new Float32Array(SIZE * SIZE);
        const rebuild = new Float32Array(SIZE * SIZE);

        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                const index = y * SIZE + x;
                const offset = index * 4;

                // A bright streak crossing the mark, which is the case that
                // caught this: a fill answers to its neighbours rather than to
                // the pixel it replaces, so on a frame where something bright
                // runs through the mark it invented a patch **42 levels
                // brighter** than what was there.
                const streak = Math.abs(x - y) < 4 ? 210 : 40;

                frame[offset] = streak;
                frame[offset + 1] = streak * 0.8;
                frame[offset + 2] = streak * 0.6;
                frame[offset + 3] = 255;

                const covered = Math.hypot(x - 16, y - 16) <= 8 ? 0.6 : 0;

                alpha[index] = covered;
                rebuild[index] = covered > 0 ? 1 : 0;
            }
        }

        const before = Uint8ClampedArray.from(frame);

        removeOverlay(frame, SIZE, SIZE, alpha, rebuild, relaxationPassesFor(16));

        // There is no arrangement of footage and overlay for which taking the
        // overlay away adds light. The un-blend obeys this on its own; the
        // rebuild does not, and an invariant is cheaper to enforce than an
        // estimator is to improve.
        for (let index = 0; index < SIZE * SIZE; index += 1) {
            for (let channel = 0; channel < 3; channel += 1) {
                const offset = index * 4 + channel;

                expect(frame[offset] ?? 0).toBeLessThanOrEqual(before[offset] ?? 0);
            }
        }
    });
});

describe("the dark half", () => {
    test("adds back exactly what the ring took, and nothing where it is zero", () => {
        const SIZE = 9;
        const frame = new Uint8ClampedArray(SIZE * SIZE * 4).fill(120);
        const alpha = new Float32Array(SIZE * SIZE);
        const rebuild = new Float32Array(SIZE * SIZE);
        const halo = new Float32Array(SIZE * SIZE * 3);

        for (let index = 0; index < SIZE * SIZE; index += 1) {
            frame[index * 4 + 3] = 255;
        }

        halo[4 * 3] = -6;
        halo[4 * 3 + 1] = -4;

        removeOverlay(frame, SIZE, SIZE, alpha, rebuild, 4, halo);

        expect(frame[4 * 4]).toBe(126);
        expect(frame[4 * 4 + 1]).toBe(124);
        expect(frame[4 * 4 + 2]).toBe(120);
        expect(frame[5 * 4]).toBe(120);
    });
});

describe("what the fill reads from", () => {
    const SIZE = 61;
    const CENTRE = 30;
    const CORE = 7;
    const REACH = 15;

    /**
     * Saturated footage, and a plane in every channel.
     *
     * A plane is the one surface a diffusion fill reproduces exactly, which is
     * the point: with the geometry taken out of the argument, whatever error is
     * left came from the values the fill was reading, not from the fill.
     */
    function footage(x: number, y: number): readonly [number, number, number] {
        return [150 + 0.9 * x, 92 + 0.35 * y, 38 + 0.25 * (x + y)];
    }

    /** A solid core inside a shoulder — a glyph with a glow, which is what a sparkle is. */
    function coverage(x: number, y: number): number {
        const distance = Math.hypot(x - CENTRE, y - CENTRE);

        if (distance <= CORE) {
            return 0.9;
        }

        return distance >= REACH ? 0 : 0.9 * (1 - (distance - CORE) / (REACH - CORE));
    }

    test("recovers the colour under the mark, not a washed-out version of it", () => {
        const frame = new Uint8ClampedArray(SIZE * SIZE * 4);
        const alpha = new Float32Array(SIZE * SIZE);
        const rebuild = new Float32Array(SIZE * SIZE);

        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                const index = y * SIZE + x;
                const covered = coverage(x, y);
                const offset = index * 4;

                footage(x, y).forEach((value, channelIndex) => {
                    frame[offset + channelIndex] = value * (1 - covered) + 255 * covered;
                });

                frame[offset + 3] = 255;

                // The estimate is a few per cent low, which is what an estimate
                // is. The un-blend then divides that error by `1 − a`, so at the
                // half-covered contour it comes back doubled — and doubled in a
                // direction that drags every channel toward the others.
                alpha[index] = covered * 0.96;
                rebuild[index] = Math.min(1, Math.max(0, (alpha[index]! - 0.5) / 0.25));
            }
        }

        removeOverlay(frame, SIZE, SIZE, alpha, rebuild, relaxationPassesFor(REACH * 2));

        let worst = 0;

        for (let y = CENTRE - 4; y <= CENTRE + 4; y += 1) {
            for (let x = CENTRE - 4; x <= CENTRE + 4; x += 1) {
                const offset = (y * SIZE + x) * 4;

                footage(x, y).forEach((value, channelIndex) => {
                    worst = Math.max(worst, Math.abs((frame[offset + channelIndex] ?? 0) - value));
                });
            }
        }

        // A fill bordering on clean footage over a plane has no excuse. Bordering
        // on the half-covered contour instead returns the patch desaturated —
        // every channel dragged toward the others — which is the grey patch in
        // the shape of the mark that a reader calls a defect.
        expect(worst).toBeLessThan(6);
    });
});

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

    test("does not tear a hole in a corner that is nearly white", () => {
        // The failure this guards is not hypothetical. Over a bright sky there
        // is barely any room between the footage and white, so a ratio taken
        // channel by channel divides two levels of noise by eight and reports a
        // quarter covered — and subtracting a quarter of white from a pixel that
        // never had it is the dark, faintly coloured patch a finished clip came
        // back with.
        const bright = (x: number, y: number, index: number): number =>
            236 + 12 * Math.sin((x + y) * 0.012 + index * 0.7);

        const renderBright = (index: number, marked: boolean): Uint8ClampedArray =>
            rgba(
                Array.from({ length: SIZE * SIZE }, (_, offset) => {
                    const x = offset % SIZE;
                    const y = (offset - x) / SIZE;
                    const base = bright(x, y, index);
                    const covered = marked ? markAlpha(x, y) : 0;

                    return base * (1 - covered) + 255 * covered;
                }),
            );

        const accumulator = createFrameAccumulator(SIZE, SIZE);

        for (let index = 0; index < DETECT_SAMPLE_COUNT; index += 1) {
            addFrameSample(accumulator, renderBright(index, true));
        }

        const detection = detectWatermark(accumulator);

        if (!detection.ok) {
            // Refusing outright is an acceptable answer over a corner this
            // bright. Wrecking it is not, which is what the rest asserts.
            return;
        }

        const frame = renderBright(3, true);
        const truth = renderBright(3, false);

        removeOverlay(frame, SIZE, SIZE, detection.profile.alpha, detection.profile.rebuild);

        let darkest = 255;

        for (let index = 0; index < SIZE * SIZE; index += 1) {
            darkest = Math.min(darkest, channel(frame, index));
        }

        // Nothing anywhere near black, and no pixel dragged far under the
        // footage it was sitting on.
        expect(darkest).toBeGreaterThan(180);

        for (let index = 0; index < SIZE * SIZE; index += 1) {
            expect(channel(truth, index) - channel(frame, index)).toBeLessThanOrEqual(24);
        }
    });

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

        removeOverlay(frame, SIZE, SIZE, detection.profile.alpha, detection.profile.rebuild);

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
        expect(worstAtGlow).toBeLessThanOrEqual(6);
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

        // Every pixel the mark covers enough to be seen is accounted for. The
        // floor is a twentieth rather than a hundredth because the flood has to
        // stop somewhere: on real footage a threshold low enough to chase the
        // last percent of a halo runs out along a caption or a pattern edge and
        // takes half the corner with it.
        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                if (markAlpha(x, y) > 0.05) {
                    expect(detection.profile.touched[y * SIZE + x]).toBe(1);
                }
            }
        }
    });
});
