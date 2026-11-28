import { describe, expect, test } from "bun:test";

import { buildObjectMesh, placeParts } from "@/modules/image-to-3d/domain/assemble";
import { MESH_DETAILS, type Mesh, type ObjectPart } from "@/modules/image-to-3d/types";
import { parseObjectSpec, tidyVessels } from "@/modules/image-to-3d/validation/object-spec";

import { directedEdgeCounts, signedVolume, unmatchedEdges } from "./geometry";
import { part, spec } from "./specs";

function build(
    parts: readonly ObjectPart[],
    detail: (typeof MESH_DETAILS)[number] = "medium",
): Mesh {
    const built = buildObjectMesh(spec(parts), detail);

    if (built === null) {
        throw new Error("built nothing");
    }

    return built.mesh;
}

function sealed(mesh: Mesh) {
    expect(unmatchedEdges(mesh)).toEqual([]);
    expect([...directedEdgeCounts(mesh).values()].every((count) => count === 1)).toBe(true);
    expect(signedVolume(mesh)).toBeGreaterThan(0);
}

const CUP_PROFILE: readonly (readonly [number, number])[] = [
    [3.2, 0],
    [3.8, 3],
    [4, 9],
];

describe("a hollow vessel", () => {
    for (const shape of ["cylinder", "lathe"] as const) {
        for (const detail of MESH_DETAILS) {
            test(`${shape}, ${detail}: one closed solid, wound outward`, () => {
                sealed(
                    build(
                        [
                            part({
                                shape,
                                size: [8, 9, 8],
                                position: [0, 4.5, 0],
                                profile: shape === "lathe" ? CUP_PROFILE : [],
                                hollow: true,
                            }),
                        ],
                        detail,
                    ),
                );
            });
        }
    }

    test("holds a fraction of the solid's volume — it is a wall, not a block", () => {
        const solid = signedVolume(build([part({ shape: "cylinder", size: [8, 10, 8] })]));
        const cup = signedVolume(
            build([part({ shape: "cylinder", size: [8, 10, 8], hollow: true })]),
        );

        expect(cup).toBeLessThan(solid * 0.45);
        expect(cup).toBeGreaterThan(solid * 0.1);
    });

    test("is open at the top: nothing covers the middle of the mouth", () => {
        const mesh = build([part({ shape: "cylinder", size: [8, 10, 8], hollow: true })]);
        let top = 0;

        for (let offset = 1; offset < mesh.positions.length; offset += 3) {
            top = Math.max(top, mesh.positions[offset]);
        }

        // Every vertex at the very top lies on the rim, far from the axis.
        for (let offset = 0; offset < mesh.positions.length; offset += 3) {
            if (Math.abs(mesh.positions[offset + 1] - top) < 1e-3) {
                expect(
                    Math.hypot(mesh.positions[offset], mesh.positions[offset + 2]),
                ).toBeGreaterThan(30);
            }
        }
    });

    test("puts a differently coloured inside in a group of its own", () => {
        const mesh = build([
            part({
                name: "mug body",
                shape: "cylinder",
                size: [8, 10, 8],
                hollow: true,
                color: [30, 70, 110],
                innerColor: [242, 239, 230],
            }),
        ]);

        expect(mesh.groups.map((group) => [group.interior, group.color])).toEqual([
            [false, [30, 70, 110]],
            [true, [242, 239, 230]],
        ]);
    });

    test("keeps one group when the inside matches the outside", () => {
        expect(
            build([part({ shape: "cylinder", size: [8, 10, 8], hollow: true })]).groups,
        ).toHaveLength(1);
    });
});

describe("a handle", () => {
    const body = part({
        name: "mug body",
        shape: "cylinder",
        size: [8, 10, 8],
        position: [0, 5, 0],
    });
    const handle = part({
        name: "mug handle",
        shape: "torus",
        axis: "z",
        size: [6, 7, 1],
        position: [5.5, 5, 0],
    });

    test("is moved onto the body's surface and only its outer half is built", () => {
        const [, placed] = placeParts([body, handle]);

        // The body's radius is 4; the ring's centre sits just inside it.
        expect(placed.part.position[0]).toBeGreaterThan(3.5);
        expect(placed.part.position[0]).toBeLessThan(4);
        expect(placed.half).not.toBeNull();
    });

    test("is a closed solid on its own, cut ends capped", () => {
        for (const detail of MESH_DETAILS) {
            const mesh = build([body, handle], detail);
            const group = mesh.groups[1];
            const indices = mesh.indices.subarray(
                group.firstIndex,
                group.firstIndex + group.indexCount,
            );

            sealed({ ...mesh, indices });
        }
    });

    test("never reaches into a hollow cup", () => {
        const mesh = build([{ ...body, hollow: true }, handle]);
        const [cup, group] = mesh.groups;
        // The model is centred on its whole footprint, handle included, so the
        // cup's axis is found from the cup's own vertices.
        let minX = Infinity;
        let maxX = -Infinity;

        for (
            let vertex = cup.firstVertex;
            vertex < cup.firstVertex + cup.vertexCount;
            vertex += 1
        ) {
            minX = Math.min(minX, mesh.positions[vertex * 3]);
            maxX = Math.max(maxX, mesh.positions[vertex * 3]);
        }

        const axisX = (minX + maxX) / 2;
        let nearest = Infinity;

        for (
            let vertex = group.firstVertex;
            vertex < group.firstVertex + group.vertexCount;
            vertex += 1
        ) {
            nearest = Math.min(
                nearest,
                Math.hypot(mesh.positions[vertex * 3] - axisX, mesh.positions[vertex * 3 + 2]),
            );
        }

        // The wall's inner face is at 36 mm; the handle stays outside it.
        expect(nearest).toBeGreaterThan(36);
    });

    test("is turned so its hole faces sideways, not into the body", () => {
        // A live run sent the ring with its axis pointing at the mug: a coin
        // glued to the side.
        const [, placed] = placeParts([body, { ...handle, axis: "x", size: [1, 7, 6] }]);

        expect(placed.part.axis).toBe("z");
        expect(placed.part.size).toEqual([6, 7, 1]);
    });

    test("stays a whole ring when there is no body beside it", () => {
        const [placed] = placeParts([handle]);

        expect(placed.half).toBeNull();
    });
});

describe("tidyVessels", () => {
    const body = part({ name: "mug body", shape: "lathe", size: [8, 10, 8], profile: CUP_PROFILE });

    test("turns a separate interior part into a hollow body with that glaze", () => {
        // The blue mug from a live run: body, a cream "mug interior", a handle.
        const interior = part({
            name: "mug interior",
            shape: "lathe",
            size: [7, 9, 7],
            position: [0, 3.6, 0],
            profile: CUP_PROFILE,
            color: [245, 240, 225],
        });
        const [tidied, ...rest] = tidyVessels([body, interior]);

        expect(rest).toEqual([]);
        expect(tidied.hollow).toBe(true);
        expect(tidied.innerColor).toEqual([245, 240, 225]);
    });

    test("drops a thick solid laid over a hollow vessel's mouth, which is a lid", () => {
        const lid = part({
            name: "mug top",
            shape: "cylinder",
            size: [8, 3, 8],
            position: [0, 9, 0],
        });

        expect(tidyVessels([{ ...body, hollow: true }, lid]).map((entry) => entry.name)).toEqual([
            "mug body",
        ]);
    });

    test("turns a thin solid rim band into a ring round the mouth", () => {
        // The enamel mug from a live run: a dark "rim band" cylinder half a
        // centimetre tall, which as a solid would have covered the mouth.
        const band = part({
            name: "rim band",
            shape: "cylinder",
            size: [8.2, 0.5, 8.2],
            position: [0, 8, 0],
        });
        const [, ring] = tidyVessels([{ ...body, hollow: true }, band]);

        expect(ring.shape).toBe("torus");
        expect(ring.axis).toBe("y");
    });

    test("keeps a rolled rim, which is a ring and open", () => {
        const rim = part({ name: "rim", shape: "torus", size: [8, 0.6, 8], position: [0, 9.7, 0] });

        expect(tidyVessels([{ ...body, hollow: true }, rim])).toHaveLength(2);
    });

    test("leaves a solid object's parts alone", () => {
        const top = part({
            name: "lid top",
            shape: "cylinder",
            size: [8, 1, 8],
            position: [0, 10, 0],
        });

        expect(tidyVessels([body, top])).toHaveLength(2);
    });
});

describe("parseObjectSpec and hollow parts", () => {
    test("sheds the point a hollow mug's profile closes its mouth with", () => {
        // All three mugs in a live run ended their profile at radius 0 across
        // the top, while marking the body hollow.
        const parsed = parseObjectSpec(
            JSON.stringify({
                name: "mug",
                height_cm: 9,
                parts: [
                    {
                        ...raw({}),
                        profile: [
                            [3.8, 0],
                            [3.8, 7.5],
                            [4, 8],
                            [0, 8],
                        ],
                    },
                ],
            }),
        );

        expect(parsed.ok && parsed.spec.parts[0].hollow).toBe(true);
        expect(parsed.ok && parsed.spec.parts[0].profile).toEqual([
            [3.8, 0],
            [3.8, 7.5],
            [4, 8],
        ]);
    });

    function raw(overrides: Record<string, unknown>) {
        return {
            name: "body",
            shape: "lathe",
            axis: "y",
            size: [8, 10, 8],
            position: [0, 5, 0],
            tilt: [0, 0, 0],
            taper: 1,
            profile: [
                [3, 0],
                [4, 10],
            ],
            color: "#1e466e",
            hollow: true,
            inner_color: "#f2efe6",
            mirror: false,
            ...overrides,
        };
    }

    function first(overrides: Record<string, unknown>) {
        const parsed = parseObjectSpec(
            JSON.stringify({ name: "mug", height_cm: 10, parts: [raw(overrides)] }),
        );

        if (!parsed.ok) {
            throw new Error(parsed.reason);
        }

        return parsed.spec.parts[0];
    }

    test("reads the inside's own colour", () => {
        expect(first({}).innerColor).toEqual([0xf2, 0xef, 0xe6]);
    });

    test("refuses to hollow something with no mouth — a bottle closing to a cap", () => {
        expect(
            first({
                profile: [
                    [3, 0],
                    [4, 6],
                    [0.5, 10],
                ],
            }).hollow,
        ).toBe(false);
        expect(first({ shape: "sphere" }).hollow).toBe(false);
    });
});
