import { describe, expect, test } from "bun:test";

import {
    blurRadiusPx,
    blurredBackgroundRect,
    coverRect,
    overscanRect,
    scaleFactor,
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

/**
 * There is deliberately no `segmentationSize` here any more. It was a second
 * copy of `fitWithinEdge` in `tools/domain/pixels.ts`, which already had its own
 * tests — `CLAUDE.md` rule 40, step one: search before writing.
 */
describe("scaleFactor", () => {
    test("is one when nothing was scaled", () => {
        const size = { width: 800, height: 600 };

        expect(scaleFactor(size, size)).toBe(1);
    });

    test("reports the ratio of the long edges", () => {
        expect(scaleFactor({ width: 4000, height: 3000 }, { width: 1000, height: 750 })).toBe(0.25);
    });

    test("reads a portrait by its height, which is its long edge", () => {
        expect(scaleFactor({ width: 600, height: 2400 }, { width: 150, height: 600 })).toBe(0.25);
    });

    test("a degenerate source scales by one rather than dividing by zero", () => {
        // Feeds a blur radius; a NaN here would reach `ctx.filter` and silently
        // paint nothing at all.
        expect(scaleFactor({ width: 0, height: 0 }, { width: 10, height: 10 })).toBe(1);
    });

    test("scaling a blur radius by it keeps the apparent strength", () => {
        // The property the small-canvas blur depends on: a quarter-size canvas
        // needs a quarter-size radius to look the same once scaled back up.
        const full = { width: 4000, height: 3000 };
        const small = { width: 900, height: 675 };

        expect(blurRadiusPx(full, 60) * scaleFactor(full, small)).toBeCloseTo(
            blurRadiusPx(small, 60),
            0,
        );
    });
});
