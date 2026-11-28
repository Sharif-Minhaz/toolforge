import { describe, expect, test } from "bun:test";

import { buildObjectMesh } from "@/modules/image-to-3d/domain/assemble";
import { PART_AXES, PART_SHAPES, MESH_DETAILS, type Mesh } from "@/modules/image-to-3d/types";

import { directedEdgeCounts, signedVolume, unmatchedEdges } from "./geometry";
import { part, spec } from "./specs";

/**
 * Every shape, on every axis, at every detail, is a closed surface facing out.
 *
 * Three separate claims, and the case study explains why each is needed: an
 * open sheet passes "every edge used once", a mesh wound inside out passes
 * both edge checks, and only the signed volume catches the second.
 */

const PROFILE: readonly (readonly [number, number])[] = [
    [2, 0],
    [3, 1],
    [1.5, 4],
    [2.5, 6],
    [0, 7],
];

function single(
    shape: (typeof PART_SHAPES)[number],
    axis: (typeof PART_AXES)[number],
    detail: (typeof MESH_DETAILS)[number],
    extra = {},
): Mesh {
    const built = buildObjectMesh(
        spec([
            part({
                shape,
                axis,
                size: [4, 6, 3],
                profile: shape === "lathe" ? PROFILE : [],
                ...extra,
            }),
        ]),
        detail,
    );

    if (built === null) {
        throw new Error(`${shape} built nothing`);
    }

    return built.mesh;
}

describe("every primitive", () => {
    for (const shape of PART_SHAPES) {
        for (const axis of PART_AXES) {
            for (const detail of MESH_DETAILS) {
                test(`${shape} along ${axis}, ${detail}: closed, manifold, facing out`, () => {
                    const mesh = single(shape, axis, detail);

                    expect(unmatchedEdges(mesh)).toEqual([]);
                    expect(
                        [...directedEdgeCounts(mesh).values()].every((count) => count === 1),
                    ).toBe(true);
                    expect(signedVolume(mesh)).toBeGreaterThan(0);
                });
            }
        }
    }

    test("a tapered box and a tapered cylinder stay closed, down to a point", () => {
        for (const shape of ["box", "cylinder"] as const) {
            for (const taper of [0, 0.4, 1]) {
                const mesh = single(shape, "y", "medium", { taper });

                expect(unmatchedEdges(mesh)).toEqual([]);
                expect(signedVolume(mesh)).toBeGreaterThan(0);
            }
        }
    });

    test("a tilted part is still closed and still faces out", () => {
        const mesh = single("cylinder", "x", "medium", { tilt: [30, 45, 10] });

        expect(unmatchedEdges(mesh)).toEqual([]);
        expect(signedVolume(mesh)).toBeGreaterThan(0);
    });

    test("a mirrored copy is turned the right way out, not inside out", () => {
        const built = buildObjectMesh(
            spec([part({ shape: "capsule", position: [5, 3, 0], mirror: true })]),
            "medium",
        );

        expect(built?.mesh.groups.length).toBe(2);
        expect(unmatchedEdges(built?.mesh as Mesh)).toEqual([]);

        // The copy's own volume, on its own, is positive.
        const mesh = built?.mesh as Mesh;
        const copy = mesh.groups[1];
        const indices = mesh.indices.subarray(copy.firstIndex, copy.firstIndex + copy.indexCount);

        expect(signedVolume({ ...mesh, indices })).toBeGreaterThan(0);
    });
});

describe("size and axis", () => {
    function extent(mesh: Mesh): number[] {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (let offset = 0; offset < mesh.positions.length; offset += 1) {
            min[offset % 3] = Math.min(min[offset % 3], mesh.positions[offset]);
            max[offset % 3] = Math.max(max[offset % 3], mesh.positions[offset]);
        }

        return max.map((value, axis) => value - min[axis]);
    }

    test("fills the world-aligned box the model gave, whichever way the part points", () => {
        // The size is in centimetres along world x, y, z; the mesh is in
        // millimetres. A box and a cylinder fill it exactly.
        for (const shape of ["box", "cylinder", "lathe"] as const) {
            for (const axis of PART_AXES) {
                const [x, y, z] = extent(single(shape, axis, "high"));

                expect(x).toBeCloseTo(40, 0);
                expect(y).toBeCloseTo(60, 0);
                expect(z).toBeCloseTo(30, 0);
            }
        }
    });

    test("points a cylinder's length down the axis it was given", () => {
        // Same size box, but the caps must sit at the ends of the named axis:
        // the vertices with the extreme x of an x-axis cylinder are a flat cap.
        const mesh = single("cylinder", "x", "medium");
        const xs = new Set<string>();

        for (let offset = 0; offset < mesh.positions.length; offset += 3) {
            xs.add(mesh.positions[offset].toFixed(3));
        }

        // A cylinder along x has exactly two distinct x values: its two caps.
        expect(xs.size).toBe(2);
    });

    test("a lathe profile written in other units fills the same box", () => {
        const scaled = PROFILE.map(([radius, height]) => [radius * 10, height * 10] as const);
        const [x, y, z] = extent(single("lathe", "y", "medium", { profile: scaled }));

        expect([x, y, z].map((value) => Math.round(value))).toEqual([40, 60, 30]);
    });
});
