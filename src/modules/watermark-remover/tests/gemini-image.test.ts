import { describe, expect, test } from "bun:test";

import { cleanGeminiPixels } from "@/modules/watermark-remover/domain/gemini-image";
import { GEMINI_DEFAULT_CORNER } from "@/modules/watermark-remover/domain/gemini-constants";
import { planCornerBox, toPixelBox } from "@/modules/watermark-remover/domain/watermark-box";
import type { NormalizedBox, PixelBox, PixelSize } from "@/modules/watermark-remover/types";

const SIZE: PixelSize = { width: 640, height: 640 };

/** The glyph, at the scale a generator actually signs a still of this size at. */
const ARM = 15;
const CORE_ALPHA = 0.88;
const GLOW_ALPHA = 0.32;
const GLOW_SIGMA = 17;

/** How rough the picture is. A generated still is not smooth, and that matters. */
const GRAIN = 1.5;

const BOX: NormalizedBox = planCornerBox(SIZE, GEMINI_DEFAULT_CORNER);
const SEARCH: PixelBox = toPixelBox(BOX, SIZE);
const CENTRE_X = SEARCH.x + SEARCH.width / 2;
const CENTRE_Y = SEARCH.y + SEARCH.height / 2;

/**
 * A four-pointed star with the glow it actually has, matching the fixture the
 * clip half's detector is tested against.
 *
 * The glow is the part that is hard: it is most of what the eye sees, it reaches
 * two or three times the core's radius, and a mark with a hard edge and nothing
 * around it passes tests a real one fails.
 */
function markAlpha(x: number, y: number): number {
    const dx = Math.abs(x - CENTRE_X);
    const dy = Math.abs(y - CENTRE_Y);

    const solid = dx + dy <= ARM && Math.min(dx, dy) <= ARM / 2 - (dx + dy) / 4 ? CORE_ALPHA : 0;
    const glow = GLOW_ALPHA * Math.exp(-(dx * dx + dy * dy) / (2 * GLOW_SIGMA * GLOW_SIGMA));

    return Math.min(1, solid + glow * (1 - solid));
}

/** Deterministic grain, so a failure is reproducible rather than occasional. */
function grainAt(x: number, y: number, channel: number): number {
    const seed = Math.sin(x * 12.9898 + y * 78.233 + channel * 37.719) * 43758.5453;

    return (seed - Math.floor(seed) - 0.5) * 2 * GRAIN;
}

/** What the picture would have been with nothing laid over it. */
function backgroundAt(x: number, y: number, channel: number): number {
    return (
        118 +
        38 * Math.sin((x + y) * 0.011 + channel) +
        22 * Math.cos(x * 0.017 - y * 0.009) +
        grainAt(x, y, channel)
    );
}

function render(marked: boolean): Uint8ClampedArray {
    const data = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);

    for (let y = 0; y < SIZE.height; y += 1) {
        for (let x = 0; x < SIZE.width; x += 1) {
            const alpha = marked ? markAlpha(x, y) : 0;
            const offset = (y * SIZE.width + x) * 4;

            for (let channel = 0; channel < 3; channel += 1) {
                data[offset + channel] = backgroundAt(x, y, channel) * (1 - alpha) + 255 * alpha;
            }

            data[offset + 3] = 255;
        }
    }

    return data;
}

/** Mean absolute error against the truth, over every pixel the mark reaches. */
function errorOverMark(pixels: Uint8ClampedArray, truth: Uint8ClampedArray): number {
    let total = 0;
    let counted = 0;

    for (let y = SEARCH.y; y < SEARCH.y + SEARCH.height; y += 1) {
        for (let x = SEARCH.x; x < SEARCH.x + SEARCH.width; x += 1) {
            if (markAlpha(x, y) < 0.02) {
                continue;
            }

            const offset = (y * SIZE.width + x) * 4;

            for (let channel = 0; channel < 3; channel += 1) {
                total += Math.abs((pixels[offset + channel] ?? 0) - (truth[offset + channel] ?? 0));
                counted += 1;
            }
        }
    }

    return total / counted;
}

function isInside(box: PixelBox, x: number, y: number): boolean {
    return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

describe("cleanGeminiPixels", () => {
    test("recovers the picture the mark was laid over", () => {
        const truth = render(false);
        const marked = render(true);
        const before = errorOverMark(marked, truth);

        const pixels = Uint8ClampedArray.from(marked);
        const outcome = cleanGeminiPixels(pixels, SIZE, BOX, false);

        expect(outcome.ok).toBe(true);

        const after = errorOverMark(pixels, truth);

        // The whole claim of the tab: what comes back is the picture that was
        // there, not something plausible in the shape of the mark. Over this
        // fixture the mark costs 21 levels of error and the un-blend gives back
        // all but 0.9 of them — under one level, which is to say inside the
        // grain. The ceilings are loose enough not to fail on arithmetic noise
        // and far too tight for a tool that merely blurred the corner.
        expect(before).toBeGreaterThan(15);
        expect(after).toBeLessThan(2.5);
    });

    test("writes nothing outside the rectangle it reports", () => {
        const marked = render(true);
        const pixels = Uint8ClampedArray.from(marked);
        const outcome = cleanGeminiPixels(pixels, SIZE, BOX, false);

        expect(outcome.ok).toBe(true);

        if (!outcome.ok) {
            return;
        }

        const { repainted } = outcome.report;
        let changedOutside = 0;

        for (let y = 0; y < SIZE.height; y += 1) {
            for (let x = 0; x < SIZE.width; x += 1) {
                if (isInside(repainted, x, y)) {
                    continue;
                }

                const offset = (y * SIZE.width + x) * 4;

                for (let channel = 0; channel < 4; channel += 1) {
                    if (pixels[offset + channel] !== marked[offset + channel]) {
                        changedOutside += 1;
                    }
                }
            }
        }

        expect(changedOutside).toBe(0);
        // …and the rectangle is a great deal smaller than the search box, which
        // is what keeps the untouched promise worth making.
        expect(repainted.width).toBeLessThan(SEARCH.width);
        expect(repainted.height).toBeLessThan(SEARCH.height);
    });

    test("refuses rather than repainting a corner with no mark in it", () => {
        const pixels = render(false);
        const outcome = cleanGeminiPixels(pixels, SIZE, BOX, false);

        expect(outcome).toEqual({ ok: false, reason: "mark_not_found" });
    });

    test("repaints the whole box when asked to, mark or no mark", () => {
        const clean = render(false);
        const pixels = Uint8ClampedArray.from(clean);
        const outcome = cleanGeminiPixels(pixels, SIZE, BOX, true);

        expect(outcome.ok).toBe(true);

        if (!outcome.ok) {
            return;
        }

        expect(outcome.report.coverage).toBe(1);
        expect(outcome.report.repainted.width).toBeGreaterThanOrEqual(SEARCH.width);
    });

    test("refuses a box too small to hold anything", () => {
        const pixels = render(true);
        const outcome = cleanGeminiPixels(pixels, { width: 2, height: 2 }, BOX, false);

        expect(outcome).toEqual({ ok: false, reason: "mark_not_found" });
    });
});
