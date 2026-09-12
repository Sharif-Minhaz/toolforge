import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS, MAX_TRIANGLES } from "@/modules/image-to-3d/domain/constants";
import { buildModel, previewStats } from "@/modules/image-to-3d/domain/model";
import { estimateMesh } from "@/modules/image-to-3d/domain/stats";
import type { Mesh, ModelOptions } from "@/modules/image-to-3d/types";
import { MODEL_SHAPES } from "@/modules/image-to-3d/types";

import { directedEdgeCounts, positionKey, signedVolume, unmatchedEdges } from "./geometry";
import { awkwardImage, croppedImage, discImage, rampImage, solidImage } from "./images";

function withOptions(patch: Partial<ModelOptions>): ModelOptions {
    return { ...DEFAULT_OPTIONS, ...patch };
}

function build(options: Partial<ModelOptions>, image = rampImage(96, 64)) {
    const result = buildModel(image, withOptions(options));

    if (!result.ok) {
        throw new Error(`expected a mesh, got ${result.reason}`);
    }

    return result;
}

describe("buildMesh sizes", () => {
    test("produces exactly the mesh the page promised", () => {
        for (const shape of MODEL_SHAPES) {
            for (const solid of [true, false]) {
                const { mesh, stats } = build({ shape, solid, resolution: 48 });

                expect(mesh.positions.length).toBe(stats.vertices * 3);
                expect(mesh.normals.length).toBe(stats.vertices * 3);
                expect(mesh.uvs.length).toBe(stats.vertices * 2);
                expect(mesh.colors.length).toBe(stats.vertices * 3);
                expect(mesh.indices.length).toBe(stats.triangles * 3);
            }
        }
    });

    test("previewStats agrees with the mesh that is eventually built", () => {
        const options = withOptions({ resolution: 64, shape: "cylinder" });
        const image = rampImage(200, 120);

        expect(previewStats({ width: 200, height: 120 }, options)).toEqual(
            build(options, image).stats,
        );
    });

    test("an open surface is the relief and nothing else", () => {
        const { stats } = build({ solid: false, resolution: 32, shape: "plane" });
        const grid = { columns: 32, rows: 21 };

        expect(stats).toEqual(estimateMesh(grid, { shape: "plane", solid: false }));
        expect(stats.triangles).toBe((grid.columns - 1) * (grid.rows - 1) * 2);
    });

    test("refuses a mesh past the ceiling instead of building it", () => {
        // Reached by asking for the finest grid on a square, which is the one
        // aspect ratio that spends every sample it is given.
        const result = buildModel(
            solidImage(2000, 2000, [128, 128, 128, 255]),
            withOptions({ shape: "plane", resolution: 384, solid: true }),
        );

        if (result.ok) {
            expect(result.stats.triangles).toBeLessThanOrEqual(MAX_TRIANGLES);

            return;
        }

        expect(result.reason).toBe("too_many_triangles");
        expect(result.triangles).toBeGreaterThan(MAX_TRIANGLES);
    });

    test("refuses a picture with no pixels rather than dividing by its width", () => {
        const empty = { data: new Uint8ClampedArray(0), width: 0, height: 0 };

        expect(buildModel(empty, DEFAULT_OPTIONS)).toEqual({ ok: false, reason: "empty_image" });
    });
});

describe("buildMesh topology", () => {
    for (const shape of MODEL_SHAPES) {
        test(`a solid ${shape} is watertight and consistently wound`, () => {
            const { mesh } = build({ shape, solid: true, resolution: 40 });

            // Two separate claims. Every directed edge used once means no two
            // triangles face opposite ways across it; every one answered by its
            // reverse means there is no border anywhere — a hole is invisible
            // to the first check on its own.
            for (const [edge, count] of directedEdgeCounts(mesh)) {
                expect(`${edge} used ${count}×`).toBe(`${edge} used 1×`);
            }

            expect(unmatchedEdges(mesh)).toEqual([]);
        });

        test(`a solid ${shape} encloses a positive volume, so it faces outward`, () => {
            expect(
                signedVolume(build({ shape, solid: true, resolution: 40 }).mesh),
            ).toBeGreaterThan(0);
        });
    }

    test("an open surface is not watertight, and says so the same way", () => {
        const { mesh } = build({ solid: false, resolution: 20 });
        const counts = [...directedEdgeCounts(mesh).values()];

        expect(counts.every((count) => count === 1)).toBe(true);
        // The border edges are used once and never answered, which is exactly
        // what "no back and no walls" means — and is what the solid case above
        // proves it does not have.
        expect(unmatchedEdges(mesh).length).toBe(2 * (32 - 1) + 2 * (21 - 1));
    });

    test("a plate's volume is its footprint times its thickness", () => {
        const grey = solidImage(64, 32, [128, 128, 128, 255]);
        const options = withOptions({
            shape: "plane",
            solid: true,
            resolution: 64,
            width: 100,
            depth: 4,
            baseThickness: 2,
            smoothing: 0,
        });
        const { mesh } = build(options, grey);

        const height = options.width * (32 / 64);
        const relief = (128 / 255) * options.depth;
        const expected = options.width * height * (options.baseThickness + relief);

        expect(signedVolume(mesh)).toBeCloseTo(expected, 1);
    });
});

describe("buildMesh attributes", () => {
    test("every normal is a unit vector", () => {
        const { mesh } = build({ shape: "cylinder", solid: true, resolution: 32 });

        for (let vertex = 0; vertex < mesh.normals.length; vertex += 3) {
            expect(
                Math.hypot(
                    mesh.normals[vertex],
                    mesh.normals[vertex + 1],
                    mesh.normals[vertex + 2],
                ),
            ).toBeCloseTo(1, 5);
        }
    });

    test("texture coordinates span the picture exactly once", () => {
        const { mesh } = build({ resolution: 32 });
        let minU = Infinity;
        let maxU = -Infinity;
        let minV = Infinity;
        let maxV = -Infinity;

        for (let vertex = 0; vertex < mesh.uvs.length; vertex += 2) {
            minU = Math.min(minU, mesh.uvs[vertex]);
            maxU = Math.max(maxU, mesh.uvs[vertex]);
            minV = Math.min(minV, mesh.uvs[vertex + 1]);
            maxV = Math.max(maxV, mesh.uvs[vertex + 1]);
        }

        expect([minU, maxU, minV, maxV]).toEqual([0, 1, 0, 1]);
    });

    test("the relief rises where the picture is bright", () => {
        // A left-to-right ramp on a plane: z grows with the column.
        const { mesh, field } = build({
            shape: "plane",
            solid: true,
            smoothing: 0,
            resolution: 32,
        });

        for (let column = 1; column < field.columns; column += 1) {
            expect(mesh.positions[column * 3 + 2]).toBeGreaterThan(
                mesh.positions[(column - 1) * 3 + 2],
            );
        }
    });

    test("inverting turns the same picture upside down in height", () => {
        // On a plate, where the height *is* the relief. An inflated body reads
        // the same values as surface detail multiplied into its bulge, so the
        // two are not complements there and are not meant to be.
        const shape = "plane" as const;
        const plain = build({ shape, solid: false, smoothing: 0, resolution: 32, invert: false });
        const inverted = build({ shape, solid: false, smoothing: 0, resolution: 32, invert: true });
        const base = DEFAULT_OPTIONS.depth;

        for (let vertex = 0; vertex < plain.stats.vertices; vertex += 1) {
            expect(
                plain.mesh.positions[vertex * 3 + 2] + inverted.mesh.positions[vertex * 3 + 2],
            ).toBeCloseTo(base, 4);
        }
    });
});

describe("the cylinder seam", () => {
    function seamPairs(mesh: Mesh, columns: number, rows: number) {
        return Array.from({ length: rows }, (_, row) => [
            row * columns,
            row * columns + columns - 1,
        ]);
    }

    test("the first and last columns are one place, not two", () => {
        const { mesh, field } = build({ shape: "cylinder", solid: true, resolution: 40 });

        for (const [first, last] of seamPairs(mesh, field.columns, field.rows)) {
            expect(positionKey(mesh, last)).toBe(positionKey(mesh, first));
        }
    });

    test("and they agree on which way they face, so the seam does not light up", () => {
        const { mesh, field } = build({ shape: "cylinder", solid: true, resolution: 40 });

        for (const [first, last] of seamPairs(mesh, field.columns, field.rows)) {
            for (let axis = 0; axis < 3; axis += 1) {
                expect(mesh.normals[last * 3 + axis]).toBeCloseTo(
                    mesh.normals[first * 3 + axis],
                    6,
                );
            }
        }
    });

    test("but they keep their own texture coordinates, or the wrap would fold", () => {
        const { mesh, field } = build({ shape: "cylinder", solid: false, resolution: 40 });

        for (const [first, last] of seamPairs(mesh, field.columns, field.rows)) {
            expect(mesh.uvs[first * 2]).toBe(0);
            expect(mesh.uvs[last * 2]).toBe(1);
        }
    });

    test("the circumference is the width the reader asked for", () => {
        const options = withOptions({ shape: "cylinder", solid: false, width: 100, depth: 0.1 });
        const { mesh } = build(options, solidImage(64, 64, [0, 0, 0, 255]));

        const radius = Math.hypot(mesh.positions[0], mesh.positions[2]);

        expect(2 * Math.PI * radius).toBeCloseTo(options.width, 2);
    });
});

describe("the inflated body", () => {
    /**
     * The sweep, and it is here because both of the defects it caught were
     * invisible to a single well-behaved case.
     *
     * A grid-carried mask frays where the subject is thin, touches the frame, or
     * has a hole in it, and the resolutions are deliberately not all round
     * numbers — an odd grid lands the outline between samples differently than
     * an even one. Three claims on every combination: closed, wound outward, and
     * free of the zero-area fins a fixed cell diagonal used to leave along the
     * outline.
     */
    const SUBJECTS = [
        { name: "disc", image: discImage(120, 90, 34) },
        { name: "thin neck and a hole", image: awkwardImage(120, 90) },
        { name: "clipped by the frame", image: croppedImage(120, 90) },
        { name: "no transparency at all", image: rampImage(120, 90) },
    ] as const;

    for (const { name, image } of SUBJECTS) {
        for (const resolution of [32, 97, 128]) {
            test(`${name}, at ${resolution} samples, is closed and faces outward`, () => {
                const { mesh } = build({ shape: "inflate", solid: true, resolution }, image);

                expect(unmatchedEdges(mesh)).toEqual([]);
                expect(signedVolume(mesh)).toBeGreaterThan(0);
            });
        }
    }

    /**
     * Manifold as well as closed — but only where the grid can carry the
     * subject, and that qualifier is a real limit rather than a hedge.
     *
     * A feature narrower than one sample has no interior for the distance
     * transform to find, so both of its sides sit at zero and the front and back
     * halves touch along it: a zero-thickness membrane joining two lobes. The
     * model is still sealed — nothing leaks through a membrane — but the edge
     * down its middle is shared by four faces instead of two, which is what
     * non-manifold means. The answer is more samples, and the article says so.
     *
     * The awkward subject's neck is three pixels of ninety, which no 32-sample
     * grid can resolve and every 97-sample one can.
     */
    for (const { name, image } of SUBJECTS) {
        for (const resolution of [97, 128]) {
            test(`${name}, at ${resolution} samples, is manifold`, () => {
                const { mesh } = build({ shape: "inflate", solid: true, resolution }, image);

                for (const [edge, count] of directedEdgeCounts(mesh)) {
                    expect(`${edge} used ${count}×`).toBe(`${edge} used 1×`);
                }
            });
        }
    }

    test("a feature thinner than one sample pinches rather than leaking", () => {
        // The limit above, pinned so it stays a documented shape of the tool
        // rather than something that quietly starts producing holes.
        const { mesh } = build(
            { shape: "inflate", solid: true, resolution: 32 },
            awkwardImage(120, 90),
        );
        const doubled = [...directedEdgeCounts(mesh).values()].filter((count) => count !== 1);

        expect(doubled.length).toBeGreaterThan(0);
        expect(unmatchedEdges(mesh)).toEqual([]);
    });

    test("leaves out everything past the outline", () => {
        const onDisc = build({ shape: "inflate", resolution: 64 }, discImage(120, 120, 40));
        const onEverything = build({ shape: "inflate", resolution: 64 }, rampImage(120, 120));

        // A disc of that radius covers a little under a third of its frame, so
        // the mesh built from it should be a fraction of the one built from the
        // whole picture rather than the same size with flat parts.
        expect(onDisc.stats.triangles).toBeLessThan(onEverything.stats.triangles / 2);
    });

    test("bulges in the middle and closes at the outline", () => {
        const { mesh, field } = build(
            { shape: "inflate", resolution: 64 },
            discImage(128, 128, 44),
        );

        let deepest = 0;
        let onOutline = 0;

        for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
            deepest = Math.max(deepest, Math.abs(mesh.positions[vertex * 3 + 2]));
        }

        // Every point of the grid that is outside the subject and still part of
        // the mesh sits at exactly zero, which is what lets the halves meet.
        for (let sample = 0; sample < field.alpha.length; sample += 1) {
            if (field.alpha[sample] < 0.5) {
                onOutline += 1;
            }
        }

        expect(deepest).toBeGreaterThan(0);
        expect(onOutline).toBeGreaterThan(0);
    });

    test("is as thick as the depth asked for, front to back", () => {
        const depth = 24;
        // Detail off, so the deepest point reaches the full bulge. With detail
        // on, the picture's own shading is multiplied in and the peak is
        // wherever the subject happens to be brightest.
        const { mesh } = build(
            { shape: "inflate", solid: true, resolution: 64, depth, detail: 0 },
            discImage(128, 128, 44),
        );

        let front = -Infinity;
        let back = Infinity;

        for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
            front = Math.max(front, mesh.positions[vertex * 3 + 2]);
            back = Math.min(back, mesh.positions[vertex * 3 + 2]);
        }

        // Half in front and half behind, so `depth` reads as the measurement
        // somebody holding the printed object would take. Within a tenth of a
        // millimetre rather than exact: the bulge is blurred before the outline
        // is put back to zero, which takes a hair off a single-point peak.
        expect(Math.abs(front - back - depth)).toBeLessThan(0.1);
    });

    test("has no zero-area triangle anywhere along the outline", () => {
        const { mesh } = build({ shape: "inflate", resolution: 97 }, awkwardImage(120, 90));

        for (let index = 0; index < mesh.indices.length; index += 3) {
            const a = mesh.indices[index] * 3;
            const b = mesh.indices[index + 1] * 3;
            const c = mesh.indices[index + 2] * 3;

            const abx = mesh.positions[b] - mesh.positions[a];
            const aby = mesh.positions[b + 1] - mesh.positions[a + 1];
            const abz = mesh.positions[b + 2] - mesh.positions[a + 2];
            const acx = mesh.positions[c] - mesh.positions[a];
            const acy = mesh.positions[c + 1] - mesh.positions[a + 1];
            const acz = mesh.positions[c + 2] - mesh.positions[a + 2];

            const area = Math.hypot(
                aby * acz - abz * acy,
                abz * acx - abx * acz,
                abx * acy - aby * acx,
            );

            expect(area).toBeGreaterThan(0);
        }
    });

    test("caps a subject that runs off the frame with a flat wall", () => {
        const { mesh } = build(
            { shape: "inflate", solid: true, resolution: 64, detail: 0 },
            croppedImage(120, 90),
        );

        // The subject reaches the left edge. There, the front and back are a
        // full thickness apart — a bust's cut, not a taper to nothing — and the
        // mesh is still closed, so something is walling that gap.
        let leftmost = Infinity;
        let front = -Infinity;
        let back = Infinity;

        for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
            leftmost = Math.min(leftmost, mesh.positions[vertex * 3]);
        }

        for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
            if (Math.abs(mesh.positions[vertex * 3] - leftmost) < 1e-6) {
                front = Math.max(front, mesh.positions[vertex * 3 + 2]);
                back = Math.min(back, mesh.positions[vertex * 3 + 2]);
            }
        }

        expect(front - back).toBeGreaterThan(DEFAULT_OPTIONS.depth * 0.5);
        expect(unmatchedEdges(mesh)).toEqual([]);
    });

    test("refuses a picture whose cut-out found nothing", () => {
        const blank = solidImage(64, 64, [0, 0, 0, 0]);

        expect(buildModel(blank, withOptions({ shape: "inflate" }))).toEqual({
            ok: false,
            reason: "empty_image",
        });
    });

    test("detail modulates the body without opening it", () => {
        const plain = build(
            { shape: "inflate", resolution: 64, detail: 0 },
            discImage(128, 128, 44),
        );
        const detailed = build(
            { shape: "inflate", resolution: 64, detail: 1 },
            discImage(128, 128, 44),
        );

        expect(unmatchedEdges(detailed.mesh)).toEqual([]);
        // Same outline, so the same cells; only the heights inside them move.
        expect(detailed.stats).toEqual(plain.stats);
    });
});
