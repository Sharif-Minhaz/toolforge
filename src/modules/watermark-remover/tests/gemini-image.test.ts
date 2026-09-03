import { describe, expect, test } from "bun:test";

import {
    cleanGeminiPixels,
    GEMINI_CORNER_ORDER,
    scanGeminiCorners,
} from "@/modules/watermark-remover/domain/gemini-image";
import { planCornerBox, toPixelBox } from "@/modules/watermark-remover/domain/watermark-box";
import {
    BOX_CORNERS,
    type BoxCorner,
    type NormalizedBox,
    type PixelBox,
    type PixelSize,
} from "@/modules/watermark-remover/types";

const SIZE: PixelSize = { width: 640, height: 640 };

/** The corner the single-mark cases plant in, and the box that covers it. */
const CORNER: BoxCorner = "bottom-left";
const BOX: NormalizedBox = planCornerBox(SIZE, CORNER);
const SEARCH: PixelBox = toPixelBox(BOX, SIZE);

/** The glyph, at the scale a generator actually signs a still of this size at. */
const ARM = 15;
const CORE_ALPHA = 0.88;
const GLOW_ALPHA = 0.32;
const GLOW_SIGMA = 17;

/** How rough the picture is. A generated still is not smooth, and that matters. */
const GRAIN = 1.5;

function centreOf(corner: BoxCorner): { x: number; y: number } {
    const box = toPixelBox(planCornerBox(SIZE, corner), SIZE);

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A four-pointed star with the glow it actually has, matching the fixture the
 * clip half's detector is tested against.
 *
 * The glow is the part that is hard: it is most of what the eye sees, it reaches
 * two or three times the core's radius, and a mark with a hard edge and nothing
 * around it passes tests a real one fails.
 */
function markAlpha(x: number, y: number, corner: BoxCorner): number {
    const centre = centreOf(corner);
    const dx = Math.abs(x - centre.x);
    const dy = Math.abs(y - centre.y);

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

/** `null` renders the picture with no mark laid over it at all. */
function render(marked: BoxCorner | null): Uint8ClampedArray {
    const data = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);

    for (let y = 0; y < SIZE.height; y += 1) {
        for (let x = 0; x < SIZE.width; x += 1) {
            const alpha = marked === null ? 0 : markAlpha(x, y, marked);
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
            if (markAlpha(x, y, CORNER) < 0.02) {
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
        const truth = render(null);
        const marked = render(CORNER);
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
        const marked = render(CORNER);
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
        const pixels = render(null);
        const outcome = cleanGeminiPixels(pixels, SIZE, BOX, false);

        expect(outcome).toEqual({ ok: false, reason: "mark_not_found" });
    });

    test("repaints the whole box when asked to, mark or no mark", () => {
        const clean = render(null);
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
        const pixels = render(CORNER);
        const outcome = cleanGeminiPixels(pixels, { width: 2, height: 2 }, BOX, false);

        expect(outcome).toEqual({ ok: false, reason: "mark_not_found" });
    });
});

/**
 * The reason the tab asks nobody where to look.
 *
 * A default corner is wrong for whichever generator does not use it, and the
 * reader it is wrong for gets `mark_not_found` on a picture that plainly has a
 * mark in it. These are the four cases that has to stop being possible in.
 */
describe("scanGeminiCorners", () => {
    test("tries every corner there is", () => {
        expect([...GEMINI_CORNER_ORDER].sort()).toEqual([...BOX_CORNERS].sort());
    });

    for (const corner of BOX_CORNERS) {
        test(`finds a mark planted in the ${corner}`, () => {
            const found = scanGeminiCorners(render(corner), SIZE);

            expect(found?.corner).toBe(corner);
        });
    }

    /**
     * What the search is, and what it is not.
     *
     * It is a comparison, not a verdict. `detectWatermark` answers "is there
     * something standing above its surroundings in this box", and on this
     * fixture — whose background is a strong low-frequency swell — three of the
     * four corners answer yes with peaks of 25, 33 and 52 on a picture with no
     * mark in it at all. That is not a bug in the detector; it is what a bright
     * smooth bump in a corner looks like to a band-pass, and a real picture has
     * lamps, skies and highlights in it.
     *
     * What separates a mark from a bump is **margin**, and the margin is large:
     * a planted mark peaks between 105 and 142 here, more than twice the loudest
     * thing the clean picture has to offer. That is why the winner is the
     * strongest corner rather than the first one over a threshold — a floor
     * tuned to this fixture would sit right on top of a real mark, which the
     * clip half measured at about a third opacity rather than this one's nine
     * tenths.
     *
     * The consequence is stated rather than hidden: handed a picture with no
     * mark, the search will name its brightest corner and repaint a little of
     * it. That is what the before-and-after slider, the corner control and
     * `Clear` are for.
     */
    test("puts a real mark far clear of the loudest thing a clean picture has", () => {
        const clean = scanGeminiCorners(render(null), SIZE);
        const marked = scanGeminiCorners(render("bottom-left"), SIZE);

        expect(marked?.corner).toBe("bottom-left");
        expect(marked?.profile.peak).toBeGreaterThan(2 * (clean?.profile.peak ?? 0));
    });
});
