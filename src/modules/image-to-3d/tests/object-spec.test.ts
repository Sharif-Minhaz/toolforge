import { describe, expect, test } from "bun:test";

import { MAX_PARTS } from "@/modules/image-to-3d/domain/constants";
import { parseObjectSpec } from "@/modules/image-to-3d/validation/object-spec";

/** A part as the model writes it, every field present, for tests to bend. */
function raw(overrides: Record<string, unknown> = {}) {
    return {
        name: "body",
        shape: "cylinder",
        axis: "y",
        size: [8, 10, 8],
        position: [0, 5, 0],
        tilt: [0, 0, 0],
        taper: 1,
        profile: [],
        color: "#c0392b",
        mirror: false,
        ...overrides,
    };
}

function answer(parts: unknown[], extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ name: "red_mug", height_cm: 10, parts, ...extra });
}

function parsed(content: string) {
    const result = parseObjectSpec(content);

    if (!result.ok) {
        throw new Error(result.reason);
    }

    return result.spec;
}

describe("parseObjectSpec", () => {
    test("reads a well-formed answer into colours, names and numbers", () => {
        const spec = parsed(answer([raw()]));

        expect(spec.name).toBe("red mug");
        expect(spec.heightCm).toBe(10);
        expect(spec.parts[0].color).toEqual([0xc0, 0x39, 0x2b]);
        expect(spec.parts[0].size).toEqual([8, 10, 8]);
    });

    test("names a reply that is not JSON as unreadable, not as an empty object", () => {
        expect(parseObjectSpec('{"name": "mug", "parts": [')).toEqual({
            ok: false,
            reason: "unreadable_response",
        });
        expect(parseObjectSpec('{"name": "mug"}')).toEqual({
            ok: false,
            reason: "unreadable_response",
        });
    });

    test("names an answer with no parts — a landscape, a screenshot — as no object", () => {
        expect(parseObjectSpec(answer([]))).toEqual({ ok: false, reason: "no_object" });
    });

    test("drops a broken part and keeps the rest of the object", () => {
        const spec = parsed(answer([raw(), raw({ shape: "teapot" }), raw({ size: [1, 2] })]));

        expect(spec.parts).toHaveLength(1);
    });

    test("bounds sizes and positions a misread could make absurd", () => {
        const spec = parsed(answer([raw({ size: [-4, 0, 1e9], position: [1e9, -1e9, 0] })]));

        expect(spec.parts[0].size[0]).toBe(4);
        expect(spec.parts[0].size[1]).toBeGreaterThan(0);
        expect(spec.parts[0].size[2]).toBeLessThanOrEqual(2_000);
        expect(Math.abs(spec.parts[0].position[0])).toBeLessThanOrEqual(2_000);
    });

    test("folds a tilt into one turn and keeps a taper between 0 and 1", () => {
        const spec = parsed(answer([raw({ tilt: [450, -90, 0], taper: 3 })]));

        expect(spec.parts[0].tilt).toEqual([90, 270, 0]);
        expect(spec.parts[0].taper).toBe(1);
    });

    test("refuses more parts than the ceiling by keeping the first ones", () => {
        const spec = parsed(answer(Array.from({ length: MAX_PARTS + 5 }, () => raw())));

        expect(spec.parts).toHaveLength(MAX_PARTS);
    });

    test("cleans names that will be shown on the page and written into files", () => {
        const spec = parsed(answer([raw({ name: "  left\u0000 \n ear  " }), raw({ name: "" })]));

        expect(spec.parts[0].name).toBe("left ear");
        expect(spec.parts[1].name).toBe("part 2");
    });
});

describe("lathe profiles", () => {
    test("stops at the first return to the axis, dropping the traced-back side", () => {
        // Exactly what a live run sent for a teapot's lid: up one side, across,
        // and back down the other.
        const spec = parsed(
            answer([
                raw({
                    shape: "lathe",
                    profile: [
                        [8, 0],
                        [7.5, 1.5],
                        [0, 1.5],
                        [7.5, 1.5],
                        [8, 0],
                    ],
                }),
            ]),
        );

        expect(spec.parts[0].profile).toEqual([
            [8, 0],
            [7.5, 1.5],
            [0, 1.5],
        ]);
    });

    test("keeps a profile that starts on the axis — a pointed base", () => {
        const profile: [number, number][] = [
            [0, 0],
            [3, 2],
            [0, 5],
        ];

        expect(parsed(answer([raw({ shape: "lathe", profile })])).parts[0].profile).toEqual(
            profile,
        );
    });

    test("turns a profile written top-down the right way up", () => {
        const spec = parsed(
            answer([
                raw({
                    shape: "lathe",
                    profile: [
                        [1, 9],
                        [3, 4],
                        [2, 0],
                    ],
                }),
            ]),
        );

        expect(spec.parts[0].profile[0]).toEqual([2, 0]);
    });

    test("falls back to a cylinder when the profile has nothing to revolve", () => {
        for (const profile of [
            [],
            [[3, 0]],
            [
                [0, 0],
                [0, 5],
            ],
        ]) {
            const spec = parsed(answer([raw({ shape: "lathe", profile })]));

            expect(spec.parts[0].shape).toBe("cylinder");
            expect(spec.parts[0].profile).toEqual([]);
        }
    });

    test("clamps negative radii to the axis rather than turning the solid inside out", () => {
        const spec = parsed(
            answer([
                raw({
                    shape: "lathe",
                    profile: [
                        [2, 0],
                        [-3, 4],
                        [1, 6],
                    ],
                }),
            ]),
        );

        // −3 becomes 0, which is the first return to the axis.
        expect(spec.parts[0].profile).toEqual([
            [2, 0],
            [0, 4],
        ]);
    });
});
