import { describe, expect, test } from "bun:test";

import { DEFAULT_LAND_OPTIONS } from "@/modules/land-measurement/domain/constants";
import {
    landOptionsSchema,
    landSearchParamsSchema,
} from "@/modules/land-measurement/validation/land-options";

describe("landOptionsSchema", () => {
    test("accepts the defaults the page starts from", () => {
        expect(landOptionsSchema.safeParse(DEFAULT_LAND_OPTIONS).success).toBe(true);
    });

    test("refuses a region the tool does not have", () => {
        expect(
            landOptionsSchema.safeParse({ ...DEFAULT_LAND_OPTIONS, bighaRegion: "sylhet" }).success,
        ).toBe(false);
    });
});

describe("landSearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(
            landSearchParamsSchema.parse({
                v: "5",
                unit: "bigha",
                bigha: "faridpur",
                kani: "chittagong",
            }),
        ).toEqual({ v: "5", unit: "bigha", bigha: "faridpur", kani: "chittagong" });
    });

    test("drops each malformed field on its own", () => {
        expect(
            landSearchParamsSchema.parse({
                v: "5",
                unit: "furlong",
                bigha: ["standard", "rangpur"],
            }),
        ).toEqual({ v: "5", unit: undefined, bigha: undefined, kani: undefined });
    });
});
