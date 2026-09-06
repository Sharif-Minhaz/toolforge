import { describe, expect, test } from "bun:test";

import {
    MAX_RESOLUTION,
    MIN_DEPTH_MM,
    MIN_RESOLUTION,
} from "@/modules/image-to-3d/domain/constants";
import {
    modelOptionsSchema,
    modelSearchParamsSchema,
} from "@/modules/image-to-3d/validation/model-options";
import { DEFAULT_OPTIONS } from "@/modules/image-to-3d/domain/constants";

describe("modelOptionsSchema", () => {
    test("accepts the defaults the page ships with", () => {
        expect(modelOptionsSchema.parse(DEFAULT_OPTIONS)).toEqual(DEFAULT_OPTIONS);
    });

    test("accepts the smallest depth, which floating point makes the awkward one", () => {
        // 0.1 × 10 is 1.0000000000000002, so an exact one-decimal test rejects
        // the very value the stepper starts at.
        expect(modelOptionsSchema.parse({ ...DEFAULT_OPTIONS, depth: MIN_DEPTH_MM }).depth).toBe(
            MIN_DEPTH_MM,
        );
    });

    test("refuses a precision no control can return to", () => {
        expect(modelOptionsSchema.safeParse({ ...DEFAULT_OPTIONS, width: 100.25 }).success).toBe(
            false,
        );
    });

    test("refuses a resolution outside the steppers", () => {
        for (const resolution of [MIN_RESOLUTION - 1, MAX_RESOLUTION + 1, 96.5]) {
            expect(modelOptionsSchema.safeParse({ ...DEFAULT_OPTIONS, resolution }).success).toBe(
                false,
            );
        }
    });
});

describe("modelSearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(
            modelSearchParamsSchema.parse({
                shape: "cylinder",
                res: "256",
                depth: "8",
                width: "120",
                smooth: "2",
                src: "alpha",
                invert: "1",
                solid: "false",
                base: "3",
                format: "stl",
            }),
        ).toEqual({
            shape: "cylinder",
            res: 256,
            depth: 8,
            width: 120,
            smooth: 2,
            src: "alpha",
            invert: true,
            solid: false,
            base: 3,
            format: "stl",
        });
    });

    test("one bad field degrades to its own default and leaves the rest alone", () => {
        const parsed = modelSearchParamsSchema.parse({
            shape: "torus",
            res: "9999",
            format: "glb",
            depth: "not a number",
        });

        expect(parsed).toEqual({
            shape: undefined,
            res: undefined,
            format: "glb",
            depth: undefined,
        });
    });

    test("keeps a backing thickness a link names even with the backing switched off", () => {
        // The reader who turns it back on should find what they asked for
        // waiting, rather than the default they never chose.
        const parsed = modelSearchParamsSchema.parse({ solid: "0", base: "4" });

        expect(parsed.solid).toBe(false);
        expect(parsed.base).toBe(4);
    });

    test("survives the shapes a query string can actually arrive in", () => {
        expect(modelSearchParamsSchema.parse({}).format).toBeUndefined();
        expect(modelSearchParamsSchema.parse({ res: ["1", "2"] }).res).toBeUndefined();
        expect(modelSearchParamsSchema.parse({ invert: "yes" }).invert).toBeUndefined();
    });
});
