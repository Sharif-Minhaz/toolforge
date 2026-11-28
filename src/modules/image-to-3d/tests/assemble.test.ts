import { describe, expect, test } from "bun:test";

import {
    buildObjectMesh,
    meshHeight,
    placeParts,
    scaleMesh,
} from "@/modules/image-to-3d/domain/assemble";
import type { Mesh } from "@/modules/image-to-3d/types";

import { signedVolume, unmatchedEdges } from "./geometry";
import { MUG, part, spec } from "./specs";

function build(source = MUG): Mesh {
    const built = buildObjectMesh(source, "medium");

    if (built === null) {
        throw new Error("built nothing");
    }

    return built.mesh;
}

describe("buildObjectMesh", () => {
    test("stands the object on the ground and centres its footprint", () => {
        // The model put this one floating and off to the side; the object it
        // meant still stands in front of the camera.
        const mesh = build(spec([part({ position: [12, 30, -4] })]));
        let minY = Infinity;
        let minX = Infinity;
        let maxX = -Infinity;

        for (let offset = 0; offset < mesh.positions.length; offset += 3) {
            minY = Math.min(minY, mesh.positions[offset + 1]);
            minX = Math.min(minX, mesh.positions[offset]);
            maxX = Math.max(maxX, mesh.positions[offset]);
        }

        expect(minY).toBeCloseTo(0, 6);
        expect(minX + maxX).toBeCloseTo(0, 6);
    });

    test("builds at the real size the parts describe, in millimetres", () => {
        // The body is 10 cm tall and the feet hang 2 mm below it.
        expect(meshHeight(build())).toBeCloseTo(102, 3);
    });

    test("gives every part one contiguous group that covers the mesh exactly", () => {
        const mesh = build();
        let vertices = 0;
        let indices = 0;

        for (const group of mesh.groups) {
            expect(group.firstVertex).toBe(vertices);
            expect(group.firstIndex).toBe(indices);
            vertices += group.vertexCount;
            indices += group.indexCount;

            // A part's triangles only ever reach its own vertices — what lets
            // the GLB writer rebase them into a node of their own.
            for (let index = 0; index < group.indexCount; index += 1) {
                const vertex = mesh.indices[group.firstIndex + index];

                expect(vertex).toBeGreaterThanOrEqual(group.firstVertex);
                expect(vertex).toBeLessThan(group.firstVertex + group.vertexCount);
            }
        }

        expect(vertices).toBe(mesh.positions.length / 3);
        expect(indices).toBe(mesh.indices.length);
    });

    test("paints each vertex its part's colour", () => {
        const mesh = build();

        for (const group of mesh.groups) {
            const vertex = (group.firstVertex + group.vertexCount - 1) * 3;

            expect([...mesh.colors.subarray(vertex, vertex + 3)]).toEqual([...group.color]);
        }
    });

    test("every shell is closed and faces out, so the whole is too", () => {
        const mesh = build();

        expect(unmatchedEdges(mesh)).toEqual([]);
        expect(signedVolume(mesh)).toBeGreaterThan(0);
    });
});

describe("placeParts", () => {
    test("adds a mirrored copy for a part off the centre line", () => {
        const placed = placeParts(MUG.parts);

        expect(placed.filter((entry) => entry.mirrored).map((entry) => entry.part.name)).toEqual([
            "foot",
        ]);
    });

    test("skips the copy for a part on the centre line, which would land on itself", () => {
        const placed = placeParts([part({ position: [0.2, 3, 0], mirror: true })]);

        expect(placed).toHaveLength(1);
    });

    test("skips the copy when the model already described the other side", () => {
        // What the model did with a hydrant's nozzles: both sides listed, and
        // the right one marked mirrored as well.
        const left = part({ name: "nozzle left", shape: "cylinder", position: [-10, 40, 0] });
        const right = part({
            name: "nozzle right",
            shape: "cylinder",
            position: [10, 40, 0],
            mirror: true,
        });

        expect(placeParts([left, right])).toHaveLength(2);
    });
});

describe("scaleMesh", () => {
    test("reaches the height asked for and keeps the proportions", () => {
        const mesh = build();
        const scaled = scaleMesh(mesh, 250);

        expect(meshHeight(scaled)).toBeCloseTo(250, 3);
        expect(scaled.positions[0] / mesh.positions[0]).toBeCloseTo(250 / 102, 5);
        // Uniform, so the normals are untouched rather than recomputed.
        expect(scaled.normals).toBe(mesh.normals);
    });
});
