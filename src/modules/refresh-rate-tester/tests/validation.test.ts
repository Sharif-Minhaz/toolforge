import { describe, expect, test } from "bun:test";

import { refreshRateTesterSearchParamsSchema } from "@/modules/refresh-rate-tester/validation/settings";

describe("refreshRateTesterSearchParamsSchema", () => {
    test("accepts a named speed", () => {
        expect(refreshRateTesterSearchParamsSchema.parse({ speed: "fast" })).toEqual({
            speed: "fast",
        });
    });

    test("falls back rather than failing on anything else", () => {
        for (const speed of ["960", "FAST", "", ["fast", "slow"], undefined]) {
            expect(refreshRateTesterSearchParamsSchema.parse({ speed })).toEqual({
                speed: undefined,
            });
        }
    });
});
