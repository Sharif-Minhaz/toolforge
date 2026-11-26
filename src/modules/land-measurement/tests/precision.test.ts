import { describe, expect, test } from "bun:test";

import { fractionDigitsFor } from "@/modules/land-measurement/domain/precision";

describe("fractionDigitsFor", () => {
    test("whole figures get four places", () => {
        expect(fractionDigitsFor(3_600)).toBe(4);
        expect(fractionDigitsFor(1)).toBe(4);
        expect(fractionDigitsFor(0)).toBe(4);
    });

    test("fractions keep four significant digits", () => {
        expect(fractionDigitsFor(0.5)).toBe(4);
        expect(fractionDigitsFor(0.0123)).toBe(5);
        // One sq ft in acres: 0.00002296.
        expect(fractionDigitsFor(1 / 43_560)).toBe(8);
    });

    test("never asks Intl for more than twelve", () => {
        expect(fractionDigitsFor(1e-20)).toBe(12);
    });
});
