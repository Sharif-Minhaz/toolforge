import { describe, expect, test } from "bun:test";

import { parseMeasurementId } from "@/modules/analytics/domain/measurement-id";

describe("parseMeasurementId", () => {
    test("accepts a GA4 measurement id", () => {
        expect(parseMeasurementId("G-ABC1234XYZ")).toBe("G-ABC1234XYZ");
    });

    test("accepts an all-digit stream token", () => {
        expect(parseMeasurementId("G-1234567890")).toBe("G-1234567890");
    });

    test("trims surrounding whitespace left by a copy-paste", () => {
        expect(parseMeasurementId("  G-ABC1234XYZ\n")).toBe("G-ABC1234XYZ");
    });

    const rejected: readonly (string | undefined)[] = [
        undefined,
        "",
        "   ",
        "G-",
        "g-abc1234xyz",
        "UA-123456-1",
        "GTM-ABC1234",
        "ABC1234XYZ",
        "G-ABC 1234",
        "G-ABC_1234",
        "<SUBSTITUTE_MEASUREMENT_ID>",
    ];

    for (const value of rejected) {
        test(`rejects ${JSON.stringify(value)}`, () => {
            expect(parseMeasurementId(value)).toBeNull();
        });
    }
});
