import { describe, expect, test } from "bun:test";

import {
    addFrameSample,
    createFrameAccumulator,
    detectWatermark,
    filledProfile,
} from "@/modules/watermark-remover/domain/glyph-mask";
import {
    outlineOf,
    removeNeutralOverlay,
} from "@/modules/watermark-remover/domain/neutral-overlay";
import { applyRepaint, planRepaint } from "@/modules/watermark-remover/domain/repaint-plan";
import { DETECT_SAMPLE_COUNT } from "@/modules/watermark-remover/domain/video-constants";
import {
    addLiftSample,
    addWordmarkSample,
    createLiftSamples,
    createWordmarkFit,
    findWordmark,
    finishWordmarkFit,
    prefersWordmark,
    topHat,
    type Wordmark,
} from "@/modules/watermark-remover/domain/wordmark";
import type { PixelBox, WatermarkProfile } from "@/modules/watermark-remover/types";

const WIDTH = 220;
const HEIGHT = 110;

/** The mark's true opacity and grey. Not white, and not nine tenths: both are measured. */
const ALPHA = 0.45;
const GREY = 216;

type Rect = readonly [x: number, y: number, width: number, height: number];

/**
 * A logo of three pieces and a four-letter name, the shape of the mark that was
 * half removed: solid blocks beside strokes six pixels wide, no glow anywhere.
 */
const MARK: readonly Rect[] = [
    [52, 40, 22, 11],
    [46, 56, 11, 20],
    [66, 58, 11, 20],
    // A letter with a hole in it.
    [84, 46, 30, 6],
    [84, 68, 30, 6],
    [84, 46, 6, 28],
    [108, 46, 6, 28],
    // Three plain ones.
    [120, 52, 6, 22],
    [132, 52, 6, 22],
    [144, 52, 16, 6],
    [144, 52, 6, 22],
];

function covers(rects: readonly Rect[], x: number, y: number): boolean {
    return rects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
}

/** Soft, tinted, moving footage that runs from nearly black to brighter than the mark. */
function footage(index: number, x: number, y: number, channel: number): number {
    const level = 25 + 215 * Math.max(0, Math.sin((index / DETECT_SAMPLE_COUNT) * Math.PI) ** 2);
    const tint = [1, 0.86, 0.62][channel] ?? 1;

    return Math.max(0, Math.min(255, (level + 9 * Math.sin((x + y) * 0.03 + index)) * tint));
}

type Scene = {
    readonly mark?: readonly Rect[];
    readonly alpha?: number;
    /** A bright streak crossing the mark in a quarter of the frames. */
    readonly streak?: boolean;
    /** Soft static scenery: bright, standing still, and not a plateau. */
    readonly glow?: boolean;
};

function render(index: number, scene: Scene): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const mark = scene.mark ?? MARK;

    for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
            const at = (y * WIDTH + x) * 4;
            const alpha = covers(mark, x, y) ? (scene.alpha ?? ALPHA) : 0;

            for (let channel = 0; channel < 3; channel += 1) {
                let under = footage(index, x, y, channel);

                if (scene.glow === true) {
                    under += 120 * Math.exp(-((x - 30) ** 2 + (y - 20) ** 2) / 900);
                }

                if (scene.streak === true && index % 4 === 0 && Math.abs(x - y - 60) < 5) {
                    under = 245;
                }

                pixels[at + channel] = (1 - alpha) * Math.min(255, under) + alpha * GREY;
            }

            pixels[at + 3] = 255;
        }
    }

    return pixels;
}

function frames(scene: Scene): readonly Uint8ClampedArray[] {
    return Array.from({ length: DETECT_SAMPLE_COUNT }, (_, index) => render(index, scene));
}

function find(scene: Scene): Wordmark | null {
    const samples = createLiftSamples(WIDTH, HEIGHT);

    for (const frame of frames(scene)) {
        addLiftSample(samples, frame);
    }

    return findWordmark(samples);
}

function cropRgba(frame: Uint8ClampedArray, box: PixelBox): Uint8ClampedArray {
    const cropped = new Uint8ClampedArray(box.width * box.height * 4);

    for (let y = 0; y < box.height; y += 1) {
        const from = ((box.y + y) * WIDTH + box.x) * 4;

        cropped.set(frame.subarray(from, from + box.width * 4), y * box.width * 4);
    }

    return cropped;
}

function must<T>(value: T | null): T {
    if (value === null) {
        throw new Error("expected a value");
    }

    return value;
}

function measure(scene: Scene): WatermarkProfile {
    const fit = createWordmarkFit(must(find(scene)), WIDTH, HEIGHT);

    for (const frame of frames(scene)) {
        addWordmarkSample(fit, cropRgba(frame, fit.window));
    }

    return finishWordmarkFit(fit, WIDTH, HEIGHT);
}

/** The mean error over the mark after cleaning one frame, against the footage it was laid on. */
function errorAfter(profile: WatermarkProfile, index: number, scene: Scene): number {
    const size = { width: WIDTH, height: HEIGHT };
    const plan = must(planRepaint(profile, { x: 0, y: 0, ...size }, size));
    const cleaned = cropRgba(render(index, scene), plan.work);
    const truth = cropRgba(render(index, { ...scene, mark: [] }), plan.work);
    let total = 0;
    let count = 0;

    applyRepaint(cleaned, plan);

    for (let y = 0; y < plan.work.height; y += 1) {
        for (let x = 0; x < plan.work.width; x += 1) {
            if (!covers(scene.mark ?? MARK, x + plan.work.x, y + plan.work.y)) {
                continue;
            }

            for (let channel = 0; channel < 3; channel += 1) {
                const at = (y * plan.work.width + x) * 4 + channel;

                total += Math.abs((cleaned[at] ?? 0) - (truth[at] ?? 0));
                count += 1;
            }
        }
    }

    return total / count;
}

describe("topHat", () => {
    test("stands a plateau at its full height and takes out anything wider than the window", () => {
        const values = new Float32Array(40 * 40).fill(50);

        for (let y = 18; y < 22; y += 1) {
            for (let x = 18; x < 22; x += 1) {
                values[y * 40 + x] = 90;
            }
        }

        for (let y = 0; y < 40; y += 1) {
            for (let x = 0; x < 14; x += 1) {
                values[y * 40 + x] = 200;
            }
        }

        const lift = topHat(values, 40, 40, 4);

        expect(lift[20 * 40 + 20]).toBe(40);
        expect(lift[20 * 40 + 5]).toBe(0);
        expect(lift[30 * 40 + 30]).toBe(0);
    });
});

describe("findWordmark", () => {
    /**
     * The defect this exists for: the lone detector kept the one blob nearest the
     * middle, so a logo and a name came back with a letter missing.
     */
    test("finds every piece of a logo and a name", () => {
        const wordmark = must(find({}));

        for (let y = 0; y < HEIGHT; y += 1) {
            for (let x = 0; x < WIDTH; x += 1) {
                expect(wordmark.glyphs[y * WIDTH + x]).toBe(covers(MARK, x, y) ? 1 : 0);
            }
        }
    });

    test("finds it at half the opacity", () => {
        expect(must(find({ alpha: 0.2 })).bounds).toEqual({ x: 46, y: 40, width: 114, height: 38 });
    });

    test("is not distracted by soft scenery or by a streak crossing it", () => {
        const bounds = { x: 46, y: 40, width: 114, height: 38 };

        expect(must(find({ glow: true })).bounds).toEqual(bounds);
        expect(must(find({ streak: true })).bounds).toEqual(bounds);
    });

    test("answers nothing for one blob, two, or none", () => {
        expect(find({ mark: [] })).toBeNull();
        expect(find({ mark: [], glow: true })).toBeNull();
        expect(find({ mark: [[100, 45, 14, 14]] })).toBeNull();
        expect(
            find({
                mark: [
                    [90, 45, 14, 14],
                    [110, 45, 14, 14],
                ],
            }),
        ).toBeNull();
    });

    test("refuses a row that runs out of the box, which is a caption", () => {
        const letters = Array.from({ length: 19 }, (_, at): Rect => [at * 12, 50, 7, 16]);

        expect(find({ mark: letters })).toBeNull();
    });

    test("refuses a tall stack, which is not how a name is set", () => {
        expect(
            find({
                mark: [
                    [100, 20, 10, 10],
                    [100, 35, 10, 10],
                    [100, 50, 10, 10],
                ],
            }),
        ).toBeNull();
    });
});

describe("finishWordmarkFit", () => {
    test("measures the grey and the opacity rather than assuming white", () => {
        const profile = measure({});

        expect(Math.abs((profile.neutral?.color ?? 0) - GREY)).toBeLessThan(4);
        expect(Math.abs((profile.alpha[60 * WIDTH + 50] ?? 0) - ALPHA)).toBeLessThan(0.02);
        expect(profile.alpha[20 * WIDTH + 20]).toBe(0);
    });

    test("is not moved by something bright crossing the mark", () => {
        const profile = measure({ streak: true });

        expect(Math.abs((profile.neutral?.color ?? 0) - GREY)).toBeLessThan(8);
        expect(Math.abs((profile.alpha[60 * WIDTH + 50] ?? 0) - ALPHA)).toBeLessThan(0.03);
    });

    /**
     * Frame 0 is nearly black and frame 12 is brighter than the mark, so the mark
     * is the light thing on one and the dark thing on the other. Assuming white
     * fits the average of the two and is wrong on both.
     */
    test("gives the footage back on dark frames and on ones brighter than the mark", () => {
        const profile = measure({});

        expect(errorAfter(profile, 0, {})).toBeLessThan(2);
        expect(errorAfter(profile, 6, {})).toBeLessThan(2);
        expect(errorAfter(profile, 12, {})).toBeLessThan(2);
    });

    test("keeps a streak that crosses the mark instead of filling over it", () => {
        const scene = { streak: true };

        expect(errorAfter(measure(scene), 4, scene)).toBeLessThan(9);
    });
});

describe("prefersWordmark", () => {
    const row: Wordmark = {
        glyphs: new Uint8Array(WIDTH * HEIGHT),
        bounds: { x: 20, y: 80, width: 120, height: 20 },
        lift: 40,
    };

    function loneAt(x: number, y: number) {
        const profile = filledProfile(WIDTH, HEIGHT);
        const touched = new Uint8Array(WIDTH * HEIGHT);

        touched[y * WIDTH + x] = 1;

        return { ok: true, profile: { ...profile, touched } } as const;
    }

    test("takes the row when there is nothing else, or when the lone mark is one of its letters", () => {
        expect(prefersWordmark(row, { ok: false, reason: "mark_not_found" }, WIDTH, HEIGHT)).toBe(
            true,
        );
        expect(prefersWordmark(row, loneAt(60, 88), WIDTH, HEIGHT)).toBe(true);
    });

    test("takes the row over a lone find out in the scenery", () => {
        expect(prefersWordmark(row, loneAt(10, 10), WIDTH, HEIGHT)).toBe(true);
    });

    test("leaves a sparkle in the middle of the box to its own detector", () => {
        expect(prefersWordmark(row, loneAt(110, 55), WIDTH, HEIGHT)).toBe(false);
    });

    test("outranks what the lone detector makes of a real wordmark", () => {
        const accumulator = createFrameAccumulator(WIDTH, HEIGHT);

        for (const frame of frames({})) {
            addFrameSample(accumulator, frame);
        }

        expect(prefersWordmark(must(find({})), detectWatermark(accumulator), WIDTH, HEIGHT)).toBe(
            true,
        );
    });
});

describe("removeNeutralOverlay", () => {
    test("leaves a patch alone where the mark does not reach", () => {
        const size = 12;
        const pixels = Uint8ClampedArray.from({ length: size * size * 4 }, (_, at) => at % 251);
        const before = Uint8ClampedArray.from(pixels);
        const alpha = new Float32Array(size * size);

        removeNeutralOverlay(
            pixels,
            size,
            size,
            {
                alpha,
                chroma: alpha,
                color: GREY,
                touched: new Uint8Array(size * size),
                outline: outlineOf(alpha, size, size),
            },
            10,
        );

        expect(pixels).toEqual(before);
    });

    test("recovers colour by its own opacity", () => {
        const size = 9;
        const at = 40;
        const alpha = new Float32Array(size * size);
        const chroma = new Float32Array(size * size);
        const pixels = new Uint8ClampedArray(size * size * 4).fill(255);

        alpha[at] = 0.4;
        chroma[at] = 0.2;

        // Red 120, green 60, blue 60 under the mark: its brightness is covered by
        // 0.4 and its colour only by 0.2.
        const luma = 0.299 * 120 + 0.587 * 60 + 0.114 * 60;
        const covered = 0.6 * luma + 0.4 * GREY;

        [120, 60, 60].forEach((value, channel) => {
            pixels[at * 4 + channel] = covered + 0.8 * (value - luma);
        });

        removeNeutralOverlay(
            pixels,
            size,
            size,
            {
                alpha,
                chroma,
                color: GREY,
                // Nothing to fill from or into: the un-blend on its own.
                touched: new Uint8Array(size * size),
                outline: new Uint8Array(size * size),
            },
            10,
        );

        expect(Math.abs((pixels[at * 4] ?? 0) - 120)).toBeLessThanOrEqual(2);
        expect(Math.abs((pixels[at * 4 + 1] ?? 0) - 60)).toBeLessThanOrEqual(2);
        expect(Math.abs((pixels[at * 4 + 2] ?? 0) - 60)).toBeLessThanOrEqual(2);
    });
});

describe("outlineOf", () => {
    test("marks the step in opacity and nothing on either side of it", () => {
        const alpha = Float32Array.from({ length: 8 }, (_, x) => (x < 4 ? 0 : 0.4));

        expect([...outlineOf(alpha, 8, 1)]).toEqual([0, 0, 0, 1, 1, 0, 0, 0]);
        expect([...outlineOf(new Float32Array(8), 8, 1)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });
});
