import { describe, expect, test } from "bun:test";

import {
    addFrameSample,
    averageLuma,
    boxBlur,
    componentsTouching,
    countMask,
    createFrameAccumulator,
    cropMask,
    detectWatermark,
    dilateMask,
    discMask,
    erodeMask,
    filledProfile,
    hysteresisMask,
    maskBounds,
    selectCentralComponent,
} from "@/modules/watermark-remover/domain/glyph-mask";
import { DETECT_SAMPLE_COUNT } from "@/modules/watermark-remover/domain/video-constants";

const SIZE = 168;
const CENTRE = 84;
const ARM = 13;
const CORE_ALPHA = 0.88;
const GLOW_ALPHA = 0.32;
const GLOW_SIGMA = 15;

/** Where a static bright bar runs across the corner and into the mark's glow. */
const BAR_TOP = CENTRE + 17;
const BAR_BOTTOM = CENTRE + 27;
const BAR_RIGHT = CENTRE + 12;
const BAR_ALPHA = 0.95;

/**
 * A four-pointed star standing in for the sparkle, centred in the box, **with
 * the glow it actually has**.
 *
 * All three of those matter and the earlier fixture had none of them. It was a
 * plus sign of single-pixel strokes parked off-centre with a hard edge and
 * nothing around it — which is not what Gemini draws, not where a reader puts
 * the box, and above all not the part that is hard.
 *
 * The glow is the part that is hard. It is most of what the eye sees, it reaches
 * two or three times the core's radius, and every mistake this module has made
 * was a mistake about it: a background estimate read from inside it, a threshold
 * that cut it off, a disc drawn too small to contain it. A mark with a hard edge
 * and no halo passes all of those.
 */
function markAlpha(x: number, y: number): number {
    const dx = Math.abs(x - CENTRE);
    const dy = Math.abs(y - CENTRE);

    // A diamond with concave sides: fat in the middle, tapering to four points.
    const solid = dx + dy <= ARM && Math.min(dx, dy) <= ARM / 2 - (dx + dy) / 4 ? CORE_ALPHA : 0;
    const glow = GLOW_ALPHA * Math.exp(-(dx * dx + dy * dy) / (2 * GLOW_SIGMA * GLOW_SIGMA));

    return Math.min(1, solid + glow * (1 - solid));
}

function isMark(x: number, y: number): boolean {
    const dx = Math.abs(x - CENTRE);
    const dy = Math.abs(y - CENTRE);

    return dx + dy <= ARM && Math.min(dx, dy) <= ARM / 2 - (dx + dy) / 4;
}

/**
 * The mark's dark half: a shallow ring outside the glyph, which both real clips
 * have and no equation in this module predicts.
 *
 * Sized from the measurement rather than from taste — on a real clip it runs
 * from about one and a half times the glyph's radius out to nearly three times
 * it, four to seven levels deep. A fixture with a fainter, narrower ring than
 * the real thing was quietly failing to exercise the code that finds it, which
 * is the same mistake as a mark with no glow, one layer out.
 */
const HALO_INNER = 34;
const HALO_OUTER = 66;
const HALO_DEPTH = 8;

function haloAt(x: number, y: number): number {
    const distance = Math.hypot(x - CENTRE, y - CENTRE);

    if (distance < HALO_INNER || distance > HALO_OUTER) {
        return 0;
    }

    const across = (distance - HALO_INNER) / (HALO_OUTER - HALO_INNER);

    return -HALO_DEPTH * Math.sin(Math.PI * across);
}

/** The bright bar: a caption, a card's lit edge, a seam in the artwork. */
function isBar(x: number, y: number): boolean {
    return y >= BAR_TOP && y <= BAR_BOTTOM && x <= BAR_RIGHT;
}

/**
 * Something bright and static in the box but nowhere near the mark — the lit
 * corner of a card, a logo bug, a caption at the other end.
 *
 * It matters more than it looks. The box the reader gets by default is a good
 * deal larger than the mark, precisely so the glow has clean picture around it,
 * and the price of that room is that more of the frame's own furniture falls
 * inside it.
 */
function isBlob(x: number, y: number): boolean {
    return x < 14 && y < 14;
}

/**
 * One frame of a clip whose footage moves under a mark that does not. The
 * gradient's period is far longer than the box, which is what a real corner of a
 * real frame looks like at this scale.
 */
/** Deterministic grain, because a real frame is never smooth and that matters. */
function grainAt(index: number, x: number, y: number): number {
    const seed = Math.sin(index * 12.9898 + x * 78.233 + y * 37.719) * 43758.5453;

    return (seed - Math.floor(seed) - 0.5) * 2;
}

function renderFrame(
    index: number,
    options: {
        marked: boolean;
        base: number;
        bar?: boolean;
        blob?: boolean;
        grain?: number;
        halo?: boolean;
    },
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);

    for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
            const background = options.base + 55 * Math.sin((x + y) * 0.02 + index * 0.7);
            const standing =
                (options.bar === true && isBar(x, y)) || (options.blob === true && isBlob(x, y));
            const over = standing ? BAR_ALPHA : 0;
            const scenery = background * (1 - over) + 255 * over;
            const alpha = options.marked ? markAlpha(x, y) : 0;
            const value =
                scenery * (1 - alpha) +
                255 * alpha +
                (options.halo === true ? haloAt(x, y) : 0) +
                (options.grain ?? 0) * grainAt(index, x, y);

            const offset = (y * SIZE + x) * 4;

            data[offset] = value;
            data[offset + 1] = value;
            data[offset + 2] = value;
            data[offset + 3] = 255;
        }
    }

    return data;
}

function accumulate(options: {
    marked: boolean;
    base: number;
    bar?: boolean;
    blob?: boolean;
    grain?: number;
    halo?: boolean;
}) {
    const accumulator = createFrameAccumulator(SIZE, SIZE);

    for (let index = 0; index < DETECT_SAMPLE_COUNT; index += 1) {
        addFrameSample(accumulator, renderFrame(index, options));
    }

    return accumulator;
}

/**
 * How closely the estimated opacity follows the mark's own, everywhere the mark
 * is visible at all.
 *
 * The glow is the mark. Everything a reader means by "the watermark is still
 * there" lives out here, at a tenth of the core's opacity and two or three times
 * its radius, and a detector that stops at the core leaves a ring exactly the
 * shape of the mark behind.
 */
function glowAccuracy(
    profile: { alpha: Float32Array; touched: Uint8Array },
    skip: (x: number, y: number) => boolean = () => false,
): {
    missed: number;
    worst: number;
} {
    let missed = 0;
    let worst = 0;

    for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
            const truth = markAlpha(x, y);

            if (truth < 0.04 || skip(x, y)) {
                continue;
            }

            const index = y * SIZE + x;

            worst = Math.max(worst, Math.abs(truth - (profile.alpha[index] ?? 0)));

            if (profile.touched[index] !== 1) {
                missed += 1;
            }
        }
    }

    return { missed, worst };
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

describe("erodeMask", () => {
    test("shrinks a block by the radius", () => {
        const mask = new Uint8Array(9 * 9);

        for (let y = 2; y <= 6; y += 1) {
            for (let x = 2; x <= 6; x += 1) {
                mask[y * 9 + x] = 1;
            }
        }

        expect(countMask(erodeMask(mask, 9, 9, 1))).toBe(9);
        expect(countMask(erodeMask(mask, 9, 9, 2))).toBe(1);
    });

    test("removes a bar thinner than the structuring element outright", () => {
        const mask = new Uint8Array(20 * 9);

        for (let y = 4; y <= 6; y += 1) {
            for (let x = 1; x < 19; x += 1) {
                mask[y * 20 + x] = 1;
            }
        }

        // Three pixels thick against a radius of two: this is the whole basis on
        // which a caption is told from a mark.
        expect(countMask(erodeMask(mask, 20, 9, 2))).toBe(0);
    });

    test("a radius under one is a copy", () => {
        const mask = Uint8Array.from([0, 1, 1, 0]);

        expect(Array.from(erodeMask(mask, 2, 2, 0))).toEqual([0, 1, 1, 0]);
    });
});

describe("discMask", () => {
    test("is a circle of the radius, centred where it was asked for", () => {
        const disc = discMask(11, 11, 5, 5, 2);

        expect(disc[5 * 11 + 5]).toBe(1);
        expect(disc[5 * 11 + 7]).toBe(1);
        expect(disc[5 * 11 + 8]).toBe(0);
        expect(disc[3 * 11 + 3]).toBe(0);
    });
});

describe("componentsTouching", () => {
    test("keeps the blob the seed lands in and drops the one it does not", () => {
        const mask = new Uint8Array(9 * 3);
        const seed = new Uint8Array(9 * 3);

        mask[0] = 1;
        mask[1] = 1;
        mask[7] = 1;
        mask[8] = 1;
        seed[1] = 1;

        const kept = componentsTouching(mask, 9, 3, seed);

        expect(kept).not.toBeNull();
        expect(Array.from(kept ?? [])).toEqual([
            1,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            ...new Array(18).fill(0),
        ]);
    });

    test("is null when the seed lands on nothing, rather than choosing again", () => {
        const mask = Uint8Array.from([0, 1, 0, 0]);
        const seed = Uint8Array.from([1, 0, 0, 0]);

        expect(componentsTouching(mask, 2, 2, seed)).toBeNull();
    });
});

describe("selectCentralComponent", () => {
    test("keeps the blob nearest the middle", () => {
        const mask = new Uint8Array(11 * 11);

        mask[5 * 11 + 5] = 1;
        mask[0] = 1;

        const chosen = selectCentralComponent(mask, 11, 11);

        expect(chosen?.[5 * 11 + 5]).toBe(1);
        expect(chosen?.[0]).toBe(0);
    });

    test("refuses a blob spanning most of the box, whatever else is in it", () => {
        const mask = new Uint8Array(11 * 11).fill(1);

        expect(selectCentralComponent(mask, 11, 11)).toBeNull();
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
        expect(detection.profile.coverage).toBeLessThan(0.35);
    });

    test("estimates how strongly the mark covers each pixel", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100 }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // The synthetic mark is laid on at a known opacity, and the estimate has
        // to come back near it — this number is what the un-blend divides by.
        expect(detection.profile.alpha[CENTRE * SIZE + CENTRE]).toBeCloseTo(CORE_ALPHA, 1);

        // Well outside the mark there is nothing to un-blend.
        expect(detection.profile.alpha[2 * SIZE + 2]).toBe(0);
    });

    test("follows the glow out to where it stops being visible", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100 }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        const { missed, worst } = glowAccuracy(detection.profile);

        expect(missed).toBe(0);
        expect(worst).toBeLessThan(0.12);
    });

    test("finds the same mark over a bright corner as over a dark one", () => {
        for (const base of [60, 100, 170]) {
            const detection = detectWatermark(accumulate({ marked: true, base }));

            expect(detection.ok).toBe(true);

            if (detection.ok) {
                expect(detection.profile.touched[CENTRE * SIZE + CENTRE]).toBe(1);
                expect(detection.profile.alpha[CENTRE * SIZE + CENTRE]).toBeCloseTo(CORE_ALPHA, 1);
            }
        }
    });

    test("measures the mark as accurately over a corner going white as over a dark one", () => {
        const dark = detectWatermark(accumulate({ marked: true, base: 55 }));
        const white = detectWatermark(accumulate({ marked: true, base: 195 }));

        expect(dark.ok).toBe(true);
        expect(white.ok).toBe(true);

        if (!dark.ok || !white.ok) {
            return;
        }

        // `Δa = ΔB / (255 − B)`, and that denominator is the whole story. Over a
        // dark corner an error of ten levels in the estimated background is a
        // hundredth of opacity and invisible; over a corner near white it is a
        // tenth, and a tenth of white subtracted from a pixel that never had it
        // is a patch a reader can point at. The same code, the same mark, and
        // the failure appears only where the picture brightens — which is what
        // makes it look like the tool cannot handle bright frames rather than
        // like a background estimate that was always slightly wrong.
        //
        // So the accuracy asked of a bright corner is the same as a dark one,
        // because the arithmetic gives no reason for it to be worse.
        expect(glowAccuracy(dark.profile).worst).toBeLessThan(0.06);
        expect(glowAccuracy(white.profile).worst).toBeLessThan(0.06);
    });

    test("leaves a bright bar that merely touches the mark where it is", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100, bar: true }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // The bar is brighter than the glow, holds as still as the mark, and is
        // joined to it — so neither brightness nor connectivity can tell them
        // apart. Thickness can, and this is the assertion that says so.
        for (let y = BAR_TOP; y <= BAR_BOTTOM; y += 1) {
            for (let x = 0; x < CENTRE - 40; x += 1) {
                expect(detection.profile.touched[y * SIZE + x]).toBe(0);
            }
        }

        expect(detection.profile.alpha[CENTRE * SIZE + CENTRE]).toBeCloseTo(CORE_ALPHA, 1);
    });

    test("measures the same mark whether or not something bright is standing next to it", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100, bar: true }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // Two separate ways a bright neighbour used to wreck the measurement, and
        // this is the assertion that catches both.
        //
        // The band-pass that finds the core measures it against a wide blur, and
        // the bar lifts that blur: the core comes back smaller than it is, so a
        // reach sized off it once is drawn well inside the mark. And the fill
        // that estimates the background takes its values from the rim of that
        // reach — which the bar crosses — so the background reads too bright and
        // every opacity under it reads too low.
        //
        // Both end the same way: the glow measures as nothing, is left in the
        // picture, and the tool looks like it half worked.
        // Where the bar itself lies the mark is on top of it, so the opacity
        // there is the two of them together and is not this test's business —
        // that overlap is repainted, and the case study says so plainly. The
        // question here is whether the *rest* of the mark still measures right.
        const { missed, worst } = glowAccuracy(detection.profile, isBar);

        expect(missed).toBe(0);
        expect(worst).toBeLessThan(0.15);
    });

    test("is not thrown off by something bright at the other end of the box", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100, blob: true }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // Every threshold in the second pass is a share of the peak, so the peak
        // has to be the *mark's*. Taken over the whole box, a brighter object
        // somewhere else raises it, and the mark is then measured against how
        // bright something unrelated is: the glow falls under the line and stays
        // in the picture.
        const { missed, worst } = glowAccuracy(detection.profile, isBlob);

        expect(missed).toBe(0);
        expect(worst).toBeLessThan(0.12);

        // …and the bright object itself is not repainted.
        expect(detection.profile.touched[2 * SIZE + 2]).toBe(0);
    });

    test("fades between recovered and rebuilt pixels over distance, not over opacity", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 100 }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // A glyph goes from covered to clear inside a pixel or two, so a
        // cross-fade written in opacity crosses its whole ramp in that same
        // pixel or two — which is not a fade, it is a switch, and a switch
        // between recovered and invented pixels draws a line along the mark's
        // outline. That line is what a reader sees left behind after everything
        // else is right.
        let jump = 0;

        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 1; x < SIZE; x += 1) {
                const index = y * SIZE + x;

                jump = Math.max(
                    jump,
                    Math.abs(
                        (detection.profile.rebuild[index] ?? 0) -
                            (detection.profile.rebuild[index - 1] ?? 0),
                    ),
                );
            }
        }

        expect(jump).toBeLessThan(0.5);
    });

    test("keeps the rebuild on the mark when the opacity map is grainy", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 110, grain: 4 }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // An opacity map made from two dozen compressed frames is not smooth, and
        // anything thresholded near its noise floor is speckle rather than a
        // region. An earlier version took `alpha > ALPHA_FLOOR` — a hundredth —
        // dilated it, eroded it, and rebuilt the difference, reasoning that this
        // is a thin ring around the mark. On a smooth synthetic mark it is. On a
        // grainy one `dilate(speckle) − erode(speckle)` is **everything**: the
        // map came back covering most of the work rect, and the tool inpainted a
        // whole corner it had already cleaned correctly. That is what a reader
        // was looking at when they said it made things worse.
        //
        // So: whatever the rebuild covers, it stays on the mark.
        let far = 0;
        let near = 0;

        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                const weight = detection.profile.rebuild[y * SIZE + x] ?? 0;

                if (weight <= 0.02) {
                    continue;
                }

                if (Math.hypot(x - CENTRE, y - CENTRE) > 34) {
                    far += 1;
                } else {
                    near += 1;
                }
            }
        }

        expect(near).toBeGreaterThan(0);
        expect(far).toBeLessThan(near * 0.25);
    });

    test("measures the dark ring around the mark, which no opacity can explain", () => {
        const detection = detectWatermark(accumulate({ marked: true, base: 120, halo: true }));

        expect(detection.ok).toBe(true);

        if (!detection.ok) {
            return;
        }

        // `o = (1 − a)·b + a·W` only ever adds light, so a tool built entirely on
        // it removes the sparkle and leaves the ring — which is what a reader
        // sees and calls the watermark still being there.
        let deepest = 0;
        let found = 0;

        for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
                const distance = Math.hypot(x - CENTRE, y - CENTRE);

                if (distance < HALO_INNER || distance > HALO_OUTER) {
                    continue;
                }

                const value = detection.profile.halo[(y * SIZE + x) * 3] ?? 0;

                deepest = Math.min(deepest, value);

                if (value < -1) {
                    found += 1;
                }
            }
        }

        expect(found).toBeGreaterThan(200);
        expect(deepest).toBeLessThan(-2);
        expect(deepest).toBeGreaterThan(-HALO_DEPTH * 3);

        // Where the bright half of the mark answers, the dark half stays out of
        // it: the two corrections never touch the same pixel.
        const centre = CENTRE * SIZE + CENTRE;

        expect(detection.profile.alpha[centre]).toBeGreaterThan(0.5);
        expect(detection.profile.halo[centre * 3]).toBe(0);

        // And clean picture well outside is left alone.
        expect(detection.profile.halo[(2 * SIZE + 2) * 3]).toBe(0);
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

        expect(Array.from(profile.rebuild).every((value) => value === 1)).toBe(true);
        expect(countMask(profile.touched)).toBe(12);
        expect(Array.from(profile.alpha).every((value) => value === 1)).toBe(true);
        expect(maskBounds(profile.touched, 3, 4)).toEqual({ x: 0, y: 0, width: 3, height: 4 });
    });
});
