import { describe, expect, test } from "bun:test";

import {
    dpiDistanceSchema,
    mouseTesterSearchParamsSchema,
} from "@/modules/mouse-tester/validation/settings";

describe("mouseTesterSearchParamsSchema", () => {
    test("accepts a window on the slider's steps", () => {
        expect(mouseTesterSearchParamsSchema.parse({ window: "80" })).toEqual({ window: 80 });
    });

    test("falls back rather than failing on anything else", () => {
        for (const window of ["12", "500", "47", "abc", ["50", "60"], undefined]) {
            expect(mouseTesterSearchParamsSchema.parse({ window })).toEqual({ window: undefined });
        }
    });
});

describe("dpiDistanceSchema", () => {
    test("holds the distance to a ruler's length in its own unit", () => {
        expect(dpiDistanceSchema("cm").safeParse("10").success).toBe(true);
        expect(dpiDistanceSchema("cm").safeParse("1").success).toBe(false);
        expect(dpiDistanceSchema("in").safeParse("30").success).toBe(false);
        expect(dpiDistanceSchema("in").safeParse("abc").success).toBe(false);
    });
});
