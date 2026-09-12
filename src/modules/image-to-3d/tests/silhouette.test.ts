import { describe, expect, test } from "bun:test";

import {
    buildSilhouette,
    inflatedHeight,
    inflationField,
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

describe("inflationField", () => {
    test("leaves everything outside at zero", () => {
        const inside = Uint8Array.from([0, 0, 0, 0]);

        expect([...inflationField(inside, { width: 2, height: 2 })]).toEqual([0, 0, 0, 0]);
    });

    test("is a paraboloid on a disc, so its square root is a hemisphere", () => {
        const size = 41;
        const inside = new Uint8Array(size * size);
        const radius = 18;

        for (let row = 0; row < size; row += 1) {
            for (let column = 0; column < size; column += 1) {
                const r = Math.hypot(column - 20, row - 20);

                inside[row * size + column] = r <= radius ? 1 : 0;
            }
        }

        const field = inflationField(inside, { width: size, height: size });
        const at = (column: number, row: number) => field[row * size + column];

        // Normalised, a paraboloid over a disc is 1 − (r/R)². Sampled along a
        // radius, the field should track that within the grid's own coarseness.
        for (const r of [0, 6, 12]) {
            expect(Math.abs(at(20 + r, 20) - (1 - (r / radius) ** 2))).toBeLessThan(0.08);
        }

        expect(at(0, 0)).toBe(0);
    });

    test("makes a narrow part lower than a wide one", () => {
        // A wide block joined to a thin bar. Distance alone would give both a
        // ridge that rises at the same rate; inflation gives the bar a fraction
        // of the block's height, which is what a leg beside a body should do.
        const { alpha, grid } = alphaFrom([
            "........................",
            ".#########.....#####....",
            ".#########.....#####....",
            ".#########..............",
            ".#########..............",
            ".#########..............",
            ".#########..............",
            ".#########..............",
            ".#########..............",
            "........................",
        ]);
        const inside = Uint8Array.from(alpha, (value) => (value > 0 ? 1 : 0));
        const field = inflationField(inside, grid);
        const at = (column: number, row: number) => field[row * grid.width + column];

        expect(at(5, 5)).toBeCloseTo(1, 6);
        expect(at(17, 1)).toBeLessThan(0.25);
        expect(at(17, 1)).toBeGreaterThan(0);
    });

    test("does not consult anything beyond the grid", () => {
        // Every cell is inside and the frame is a mirror, so nothing ever
        // bounds the field: a subject that fills the frame continues past it
        // rather than ending at it, and the mesh caps the open edge instead.
        // With no outline at all the equation has no anchor, so the field just
        // grows and its exact shape is an artefact of sweep order; what matters
        // is that no edge is dragged toward zero.
        const inside = new Uint8Array(9).fill(1);

        for (const value of inflationField(inside, { width: 3, height: 3 })) {
            expect(value).toBeGreaterThan(0.5);
        }
    });

    test("is symmetric, which a one-directional sweep would not be", () => {
        const { alpha, grid } = alphaFrom([".....", ".###.", ".###.", ".###.", "....."]);
        const inside = Uint8Array.from(alpha, (value) => (value > 0 ? 1 : 0));
        const field = inflationField(inside, grid);

        expect(field[grid.width + 2]).toBeCloseTo(field[3 * grid.width + 2], 4);
        expect(field[2 * grid.width + 1]).toBeCloseTo(field[2 * grid.width + 3], 4);
    });
});

describe("buildSilhouette", () => {
    test("reports nothing to inflate when the picture is empty", () => {
        const alpha = new Float32Array(16);

        expect(buildSilhouette(alpha, { width: 4, height: 4 }).present).toBe(false);
    });

    test("keeps a subject that reaches the frame at full height there", () => {
        // A portrait cropped at the chest continues past the frame. Treating
        // the frame as its outline wedged the body to nothing along a straight
        // line; now it stays thick to the edge and the mesh caps it flat.
        const { alpha, grid } = alphaFrom(["..###..", "..###..", "..###..", "..###..", "..###.."]);
        const { depth } = buildSilhouette(alpha, grid);
        const at = (column: number, row: number) => depth[row * grid.width + column];

        expect(at(3, 0)).toBeGreaterThan(0.5);
        expect(at(3, 4)).toBeGreaterThan(0.5);
        expect(at(0, 2)).toBe(0);
    });

    test("rises to the top at the deepest point and zero at the outline", () => {
        // Wide enough that the blur on the outline does not reach the middle.
        const { alpha, grid } = alphaFrom([
            ".........................",
            ...Array.from({ length: 9 }, () => `.${"#".repeat(23)}.`),
            ".........................",
        ]);
        const { depth } = buildSilhouette(alpha, grid);

        // Near one rather than exactly: the bulge is blurred before the outline
        // is put back to zero, which takes a hair off a single-point peak.
        expect(Math.max(...depth)).toBeGreaterThan(0.95);
        // The transparent ring is the outline, and it is exactly zero there.
        expect(depth[0]).toBe(0);
        expect(depth[5 * grid.width]).toBe(0);
        // One cell inside it is already well off the floor.
        expect(depth[5 * grid.width + 1]).toBeGreaterThan(0.3);
    });

    test("half-transparent edges land outside, so a soft mask still has an outline", () => {
        const alpha = Float32Array.from([0.49, 0.51, 0.51, 0.49]);
        const { inside } = buildSilhouette(alpha, { width: 4, height: 1 });

        expect([...inside]).toEqual([0, 1, 1, 0]);
    });

    test("a cell barely inside the outline stands barely off the floor", () => {
        // Fractional coverage scales the first ring, which is what turns the
        // outline's staircase back into a slope.
        const { alpha, grid } = alphaFrom([".....", ".###.", ".###.", ".###.", "....."]);
        const barely = Float32Array.from(alpha);

        barely[grid.width + 1] = 0.55;

        const { depth } = buildSilhouette(barely, grid);
        const full = buildSilhouette(alpha, grid).depth;

        // Lower than it would be fully inside, and still above the floor. Not a
        // ratio: on a grid this small the blur that follows the ramp lifts the
        // cell back toward its neighbours, and the number would be a fact about
        // the blur rather than about the ramp.
        expect(depth[grid.width + 1]).toBeGreaterThan(0);
        expect(depth[grid.width + 1]).toBeLessThan(full[grid.width + 1]);
    });

    test("is a rounded profile rather than a tent", () => {
        const { alpha, grid } = alphaFrom([
            ".........................",
            ...Array.from({ length: 9 }, () => `.${"#".repeat(23)}.`),
            ".........................",
        ]);
        const { depth } = buildSilhouette(alpha, grid);
        const at = (column: number, row: number) => depth[row * grid.width + column];

        // Halfway in from the top edge of a strip five deep, a cone would sit at
        // half height. A circular cross-section is well above it, which is the
        // difference between a folded card and a body — and the first ring in
        // is a slope rather than a cliff.
        expect(at(12, 3)).toBeGreaterThan(0.8);
        expect(at(12, 1)).toBeGreaterThan(0.3);
        expect(at(12, 1)).toBeLessThan(at(12, 2));
        expect(at(12, 2)).toBeLessThan(at(12, 3));
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
