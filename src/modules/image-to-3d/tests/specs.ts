import type { ObjectPart, ObjectSpec } from "@/modules/image-to-3d/types";

/** One part with everything defaulted to the plainest value, for tests to override. */
export function part(overrides: Partial<ObjectPart> = {}): ObjectPart {
    return {
        name: "part",
        shape: "box",
        axis: "y",
        size: [4, 6, 2],
        position: [0, 3, 0],
        tilt: [0, 0, 0],
        taper: 1,
        profile: [],
        color: [200, 40, 30],
        mirror: false,
        ...overrides,
    };
}

export function spec(parts: readonly ObjectPart[], name = "object"): ObjectSpec {
    return { name, heightCm: 10, parts };
}

/**
 * A mug the way the model described the drawn one in the first live run, with
 * the pieces it got right put where they belong: a lathed body, a torus handle
 * pointing at the viewer, and a pair of mirrored feet so the copy path runs.
 */
export const MUG = spec(
    [
        part({
            name: "body",
            shape: "lathe",
            size: [8, 10, 8],
            position: [0, 5, 0],
            profile: [
                [3.6, 0],
                [4, 0.4],
                [4, 10],
                [3.6, 10],
                [3.6, 1],
                [0, 1],
            ],
            color: [192, 57, 43],
        }),
        part({
            name: "handle",
            shape: "torus",
            axis: "z",
            size: [4, 6, 1.2],
            position: [4.6, 5.5, 0],
            color: [192, 57, 43],
        }),
        part({
            name: "foot",
            shape: "sphere",
            size: [1.2, 0.8, 1.2],
            position: [2.5, 0.2, 2.5],
            color: [40, 40, 40],
            mirror: true,
        }),
    ],
    "coffee mug",
);
