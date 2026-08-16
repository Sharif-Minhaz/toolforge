import { describe, expect, test } from "bun:test";

import {
    blurRadiusPx,
    blurredBackgroundRect,
    coverRect,
    overscanRect,
    segmentationSize,
} from "../domain/compose-geometry";
import { BLUR_OVERSCAN_FACTOR, MAX_BLUR_SHARE } from "../domain/constants";

describe("coverRect", () => {
    test("fills the frame exactly when the aspect ratios match", () => {
        expect(coverRect({ width: 100, height: 50 }, { width: 400, height: 200 })).toEqual({
            x: 0,
            y: 0,
            width: 400,
            height: 200,
        });
    });

    test("overflows the sides for a background wider than the frame, centred", () => {
        const rect = coverRect({ width: 200, height: 100 }, { width: 100, height: 100 });

        expect(rect.height).toBe(100);
        expect(rect.width).toBe(200);
        // Half the overflow on each side, so the middle of the picture survives.
        expect(rect.x).toBe(-50);
        expect(rect.y).toBe(0);
    });

    test("overflows top and bottom for a background taller than the frame", () => {
        const rect = coverRect({ width: 100, height: 200 }, { width: 100, height: 100 });

        expect(rect.width).toBe(100);
        expect(rect.height).toBe(200);
        expect(rect.x).toBe(0);
        expect(rect.y).toBe(-50);
    });

    test("never leaves a gap — the whole frame is always covered", () => {
        const frame = { width: 640, height: 360 };
        const sources = [
            { width: 1, height: 1000 },
            { width: 1000, height: 1 },
            { width: 3, height: 4 },
            { width: 1920, height: 1080 },
        ];

        for (const source of sources) {
            const rect = coverRect(source, frame);

            expect(rect.x).toBeLessThanOrEqual(0);
            expect(rect.y).toBeLessThanOrEqual(0);
            expect(rect.x + rect.width).toBeGreaterThanOrEqual(frame.width);
            expect(rect.y + rect.height).toBeGreaterThanOrEqual(frame.height);
        }
    });

    test("a degenerate source fills the frame rather than dividing by zero", () => {
        expect(coverRect({ width: 0, height: 0 }, { width: 20, height: 10 })).toEqual({
            x: 0,
            y: 0,
            width: 20,
            height: 10,
        });
    });
});

describe("blurRadiusPx", () => {
    test("is measured against the shorter side, so a panorama still blurs", () => {
        const wide = blurRadiusPx({ width: 4000, height: 1000 }, 100);
        const square = blurRadiusPx({ width: 1000, height: 1000 }, 100);

        expect(wide).toBe(square);
        expect(wide).toBe(Math.round(1000 * MAX_BLUR_SHARE));
    });

    test("scales linearly with strength", () => {
        const size = { width: 2000, height: 2000 };

        expect(blurRadiusPx(size, 50)).toBe(Math.round(blurRadiusPx(size, 100) / 2));
    });

    test("a strength of zero is no blur at all", () => {
        expect(blurRadiusPx({ width: 1000, height: 1000 }, 0)).toBe(0);
    });

    test("clamps a strength outside the control's range", () => {
        const size = { width: 1000, height: 1000 };

        expect(blurRadiusPx(size, 500)).toBe(blurRadiusPx(size, 100));
        expect(blurRadiusPx(size, -20)).toBe(0);
    });

    test("returns a whole number of pixels", () => {
        expect(Number.isInteger(blurRadiusPx({ width: 1337, height: 733 }, 37))).toBe(true);
    });
});

describe("overscanRect", () => {
    test("grows the frame by the blur's reach on every side", () => {
        const rect = overscanRect({ width: 100, height: 80 }, 5, 2);

        expect(rect).toEqual({ x: -10, y: -10, width: 120, height: 100 });
    });

    test("a zero radius leaves the frame exactly where it was", () => {
        expect(overscanRect({ width: 100, height: 80 }, 0)).toEqual({
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        });
    });

    test("keeps the frame centred inside the grown rectangle", () => {
        const frame = { width: 300, height: 200 };
        const rect = overscanRect(frame, 12);

        expect(rect.x + rect.width / 2).toBeCloseTo(frame.width / 2, 6);
        expect(rect.y + rect.height / 2).toBeCloseTo(frame.height / 2, 6);
    });
});

describe("blurredBackgroundRect", () => {
    test("covers the grown rectangle, not just the frame", () => {
        const frame = { width: 400, height: 300 };
        const radius = 10;
        const rect = blurredBackgroundRect(frame, frame, radius);
        const bleed = radius * BLUR_OVERSCAN_FACTOR;

        // Every edge of the *grown* box has real pixels behind it, which is the
        // whole point: a blur at the frame's edge must never sample nothing.
        expect(rect.x).toBeLessThanOrEqual(-bleed);
        expect(rect.y).toBeLessThanOrEqual(-bleed);
        expect(rect.x + rect.width).toBeGreaterThanOrEqual(frame.width + bleed);
        expect(rect.y + rect.height).toBeGreaterThanOrEqual(frame.height + bleed);
    });

    test("scales the source up once, not twice", () => {
        // The bug this guards: covering the frame and *then* overscanning
        // multiplies both factors, so the reader's background arrives cropped to
        // its middle. Stated as the invariant rather than as a number — the
        // source's aspect ratio survives, and it is scaled just far enough to
        // cover the grown box and no further.
        const source = { width: 400, height: 200 };
        const frame = { width: 200, height: 100 };
        const radius = 5;
        const grown = overscanRect(frame, radius);
        const rect = blurredBackgroundRect(source, frame, radius);

        expect(rect.width / rect.height).toBeCloseTo(source.width / source.height, 6);
        expect(rect.width).toBeGreaterThanOrEqual(grown.width);
        expect(rect.height).toBeGreaterThanOrEqual(grown.height);
        // Cover means one side lands exactly on the box; anything more is the
        // double-scaling bug.
        expect(Math.min(rect.width - grown.width, rect.height - grown.height)).toBeCloseTo(0, 6);
    });

    test("a zero radius is the plain cover fit", () => {
        const frame = { width: 200, height: 100 };

        expect(blurredBackgroundRect({ width: 400, height: 100 }, frame, 0)).toEqual(
            coverRect({ width: 400, height: 100 }, frame),
        );
    });
});

describe("segmentationSize", () => {
    test("leaves a picture that already fits completely alone", () => {
        const size = { width: 800, height: 600 };

        expect(segmentationSize(size, 2048)).toBe(size);
    });

    test("caps the longer side and keeps the aspect ratio", () => {
        const capped = segmentationSize({ width: 6000, height: 4000 }, 2048);

        expect(capped.width).toBe(2048);
        expect(capped.height).toBe(1365);
    });

    test("caps a portrait by its height", () => {
        const capped = segmentationSize({ width: 3000, height: 6000 }, 1200);

        expect(capped.height).toBe(1200);
        expect(capped.width).toBe(600);
    });

    test("never rounds a side down to zero", () => {
        // A canvas with a zero side throws rather than degrading, so a strip
        // this extreme has to come back as one pixel tall.
        const capped = segmentationSize({ width: 8000, height: 2 }, 1024);

        expect(capped.width).toBe(1024);
        expect(capped.height).toBeGreaterThanOrEqual(1);
    });
});
