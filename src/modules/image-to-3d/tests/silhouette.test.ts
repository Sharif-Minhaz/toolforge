import { describe, expect, test } from "bun:test";

import {
    buildSilhouette,
    distanceTransform,
    inflatedHeight,
} from "@/modules/image-to-3d/domain/silhouette";

/** Reads a picture drawn as text, so the shape under test is visible in it. */
function alphaFrom(rows: readonly string[]): {
    alpha: Float32Array;
    grid: { width: number; height: number };
} {
    const width = rows[0].length;
    const alpha = new Float32Array(width * rows.length);

    rows.forEach((row, y) => {
        [...row].forEach((cell, x) => {
            alpha[y * width + x] = cell === "#" ? 1 : 0;
        });
    });

    return { alpha, grid: { width, height: rows.length } };
}

describe("distanceTransform", () => {
    test("leaves everything outside at zero", () => {
        const inside = Uint8Array.from([0, 0, 0, 0]);

        expect([...distanceTransform(inside, { width: 2, height: 2 })]).toEqual([0, 0, 0, 0]);
    });

    test("treats the world beyond the grid as outside", () => {
        // Every cell is inside, so the only thing that can bound the distance is
        // the edge of the grid itself.
        const inside = new Uint8Array(9).fill(1);
        const distance = distanceTransform(inside, { width: 3, height: 3 });

        // The edge ring is one orthogonal step from the world outside the grid,
        // and the middle is one step further in again.
        expect(distance[0]).toBe(3);
        expect(distance[4]).toBe(6);
    });

    test("grows toward the middle of a wider shape", () => {
        const inside = new Uint8Array(49).fill(1);
        const distance = distanceTransform(inside, { width: 7, height: 7 });

        expect(distance[24]).toBeGreaterThan(distance[8]);
        expect(distance[8]).toBeGreaterThan(distance[0]);
    });

    test("is symmetric, which a single-pass sweep would not be", () => {
        const { alpha, grid } = alphaFrom([".....", ".###.", ".###.", ".###.", "....."]);
        const inside = Uint8Array.from(alpha, (value) => (value > 0 ? 1 : 0));
        const distance = distanceTransform(inside, grid);

        // The four cells around the centre are the same distance in from four
        // different directions. A forward pass alone answers two of them.
        expect(distance[grid.width + 2]).toBe(distance[3 * grid.width + 2]);
        expect(distance[2 * grid.width + 1]).toBe(distance[2 * grid.width + 3]);
    });
});

describe("buildSilhouette", () => {
    test("reports nothing to inflate when the picture is empty", () => {
        const alpha = new Float32Array(16);

        expect(buildSilhouette(alpha, { width: 4, height: 4 }).present).toBe(false);
    });

    test("clips the outline at the frame, so a full-bleed picture still closes", () => {
        // Every pixel opaque. Without the clip the border would stand a full
        // bulge high against a straight wall and the two halves could not meet.
        const alpha = new Float32Array(36).fill(1);
        const { depth, inside } = buildSilhouette(alpha, { width: 6, height: 6 });

        for (let column = 0; column < 6; column += 1) {
            expect(inside[column]).toBe(0);
            expect(depth[column]).toBe(0);
            expect(depth[5 * 6 + column]).toBe(0);
        }

        expect(depth[2 * 6 + 2]).toBeGreaterThan(0);
    });

    test("rises to exactly one at the deepest point and zero at the outline", () => {
        const { alpha, grid } = alphaFrom([
            ".......",
            ".#####.",
            ".#####.",
            ".#####.",
            ".#####.",
            ".#####.",
            ".......",
        ]);
        const { depth } = buildSilhouette(alpha, grid);

        expect(Math.max(...depth)).toBeCloseTo(1, 6);
        // The transparent ring is the outline, and it is exactly zero there.
        expect(depth[0]).toBe(0);
        expect(depth[grid.width]).toBe(0);
        // One cell inside it is already off the floor.
        expect(depth[grid.width + 1]).toBeGreaterThan(0);
    });

    test("half-transparent edges land outside, so a soft mask still has an outline", () => {
        const alpha = Float32Array.from([0.49, 0.51, 0.51, 0.49]);
        const { inside } = buildSilhouette(alpha, { width: 4, height: 1 });

        expect([...inside]).toEqual([0, 0, 0, 0]);
    });

    test("is a rounded profile rather than a tent", () => {
        const { alpha, grid } = alphaFrom([
            ".............",
            ".###########.",
            ".###########.",
            ".###########.",
            ".............",
        ]);
        const { depth } = buildSilhouette(alpha, grid);

        // Halfway in, a cone would be at 0.5. A circular cross-section is well
        // above it, which is the difference between a folded card and a body.
        const middle = depth[2 * grid.width + 6];
        const halfway = depth[2 * grid.width + 2];

        expect(middle).toBeCloseTo(1, 6);
        expect(halfway).toBeGreaterThan(0.5);
    });
});

describe("inflatedHeight", () => {
    test("hands nothing over at zero detail", () => {
        expect(inflatedHeight(0.8, 0.1, 0)).toBeCloseTo(0.8, 6);
        expect(inflatedHeight(0.8, 0.9, 0)).toBeCloseTo(0.8, 6);
    });

    test("multiplies the relief in rather than adding it", () => {
        // The whole closure depends on this: added, the outline would lift off
        // zero and the two halves would never meet.
        for (const relief of [0, 0.25, 0.5, 1]) {
            for (const detail of [0, 0.5, 1]) {
                expect(inflatedHeight(0, relief, detail)).toBe(0);
            }
        }
    });

    test("never lifts a point above the bulge it started from", () => {
        for (const relief of [0, 0.5, 1]) {
            expect(inflatedHeight(0.6, relief, 1)).toBeLessThanOrEqual(0.6 + 1e-9);
        }
    });
});
