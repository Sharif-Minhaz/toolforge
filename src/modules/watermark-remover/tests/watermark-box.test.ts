import { describe, expect, test } from "bun:test";

import {
    DEFAULT_BOX_SIDE_RATIO,
    MAX_BOX_SIDE_RATIO,
    MIN_BOX_SIDE_RATIO,
} from "@/modules/watermark-remover/domain/video-constants";
import {
    clampNormalizedBox,
    expandPixelBox,
    nudgeNormalizedBox,
    planDefaultBox,
    referenceSide,
    resizeNormalizedBox,
    toNormalizedBox,
    toPixelBox,
} from "@/modules/watermark-remover/domain/watermark-box";

const LANDSCAPE = { width: 1920, height: 1080 };
const PORTRAIT = { width: 1080, height: 1920 };
const SQUARE = { width: 720, height: 720 };

describe("referenceSide", () => {
    test("is the shorter side, whichever way the frame is turned", () => {
        expect(referenceSide(LANDSCAPE)).toBe(1080);
        expect(referenceSide(PORTRAIT)).toBe(1080);
        expect(referenceSide(SQUARE)).toBe(720);
    });
});

describe("planDefaultBox", () => {
    const sizes = [LANDSCAPE, PORTRAIT, SQUARE, { width: 1280, height: 720 }];

    for (const size of sizes) {
        test(`sits flush in the bottom-right corner of ${size.width}x${size.height}`, () => {
            const box = toPixelBox(planDefaultBox(size), size);

            expect(box.x + box.width).toBe(size.width);
            expect(box.y + box.height).toBe(size.height);
        });

        test(`is square and scaled to the shorter side of ${size.width}x${size.height}`, () => {
            const box = toPixelBox(planDefaultBox(size), size);

            expect(box.width).toBe(box.height);
            expect(box.width).toBe(Math.round(DEFAULT_BOX_SIDE_RATIO * referenceSide(size)));
        });
    }
});

describe("toPixelBox", () => {
    test("always stays inside the frame, whatever it is handed", () => {
        const wild = [
            { x: -3, y: -3, side: 0.2 },
            { x: 5, y: 5, side: 0.2 },
            { x: 0.9, y: 0.9, side: 0.5 },
            { x: 0.5, y: 0.5, side: 12 },
            { x: Number.NaN, y: 0.5, side: 0.2 },
        ];

        for (const box of wild) {
            const pixels = toPixelBox(box, LANDSCAPE);

            expect(pixels.x).toBeGreaterThanOrEqual(0);
            expect(pixels.y).toBeGreaterThanOrEqual(0);
            expect(pixels.x + pixels.width).toBeLessThanOrEqual(LANDSCAPE.width);
            expect(pixels.y + pixels.height).toBeLessThanOrEqual(LANDSCAPE.height);
        }
    });

    test("holds the side between the two ratios", () => {
        const reference = referenceSide(LANDSCAPE);

        expect(toPixelBox({ x: 0, y: 0, side: 0.0001 }, LANDSCAPE).width).toBe(
            Math.round(MIN_BOX_SIDE_RATIO * reference),
        );
        expect(toPixelBox({ x: 0, y: 0, side: 9 }, LANDSCAPE).width).toBe(
            Math.round(MAX_BOX_SIDE_RATIO * reference),
        );
    });

    test("is square in pixels even on a frame that is not", () => {
        const box = toPixelBox({ x: 0.1, y: 0.1, side: 0.3 }, PORTRAIT);

        expect(box.width).toBe(box.height);
    });
});

describe("clampNormalizedBox", () => {
    test("is a fixed point — clamping twice changes nothing", () => {
        const once = clampNormalizedBox({ x: 3, y: -1, side: 0.9 }, LANDSCAPE);
        const twice = clampNormalizedBox(once, LANDSCAPE);

        expect(twice).toEqual(once);
    });

    test("round-trips a box that was already legal", () => {
        const box = planDefaultBox(SQUARE);

        expect(clampNormalizedBox(box, SQUARE)).toEqual(box);
    });
});

describe("nudgeNormalizedBox", () => {
    test("moves by the share it is given", () => {
        const start = clampNormalizedBox({ x: 0.5, y: 0.5, side: 0.2 }, LANDSCAPE);
        const moved = toPixelBox(nudgeNormalizedBox(start, 0.01, -0.01, LANDSCAPE), LANDSCAPE);
        const before = toPixelBox(start, LANDSCAPE);

        expect(moved.x - before.x).toBe(Math.round(0.01 * LANDSCAPE.width));
        expect(moved.y - before.y).toBe(-Math.round(0.01 * LANDSCAPE.height));
    });

    test("cannot be pushed off the edge", () => {
        let box = planDefaultBox(LANDSCAPE);

        for (let step = 0; step < 200; step += 1) {
            box = nudgeNormalizedBox(box, 0.05, 0.05, LANDSCAPE);
        }

        const pixels = toPixelBox(box, LANDSCAPE);

        expect(pixels.x + pixels.width).toBe(LANDSCAPE.width);
        expect(pixels.y + pixels.height).toBe(LANDSCAPE.height);
    });
});

describe("resizeNormalizedBox", () => {
    test("keeps the bottom-right corner where it was", () => {
        const start = clampNormalizedBox({ x: 0.4, y: 0.4, side: 0.2 }, LANDSCAPE);
        const before = toPixelBox(start, LANDSCAPE);
        const after = toPixelBox(resizeNormalizedBox(start, 0.05, LANDSCAPE), LANDSCAPE);

        expect(after.x + after.width).toBe(before.x + before.width);
        expect(after.y + after.height).toBe(before.y + before.height);
        expect(after.width).toBeGreaterThan(before.width);
    });

    test("bottoms out rather than inverting", () => {
        let box = planDefaultBox(LANDSCAPE);

        for (let step = 0; step < 50; step += 1) {
            box = resizeNormalizedBox(box, -0.1, LANDSCAPE);
        }

        expect(toPixelBox(box, LANDSCAPE).width).toBe(
            Math.round(MIN_BOX_SIDE_RATIO * referenceSide(LANDSCAPE)),
        );
    });
});

describe("toNormalizedBox", () => {
    test("undoes toPixelBox", () => {
        const box = { x: 200, y: 300, width: 216, height: 216 };
        const back = toPixelBox(toNormalizedBox(box, LANDSCAPE), LANDSCAPE);

        expect(back).toEqual(box);
    });
});

describe("expandPixelBox", () => {
    test("adds the margin on every side it can", () => {
        expect(expandPixelBox({ x: 100, y: 100, width: 40, height: 40 }, 8, LANDSCAPE)).toEqual({
            x: 92,
            y: 92,
            width: 56,
            height: 56,
        });
    });

    test("clips at the frame instead of reaching outside it", () => {
        expect(expandPixelBox({ x: 1900, y: 1060, width: 20, height: 20 }, 8, LANDSCAPE)).toEqual({
            x: 1892,
            y: 1052,
            width: 28,
            height: 28,
        });
    });
});
