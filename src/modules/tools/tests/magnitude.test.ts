import { describe, expect, test } from "bun:test";

import { describeMagnitude, MAGNITUDE_SCALES, superscript } from "@/modules/tools/domain/magnitude";

describe("describeMagnitude", () => {
    test("leaves a number a grouping separator can carry alone", () => {
        expect(describeMagnitude(0)).toEqual({ kind: "plain", value: 0 });
        expect(describeMagnitude(5.5)).toEqual({ kind: "plain", value: 5.5 });
        expect(describeMagnitude(-187)).toEqual({ kind: "plain", value: -187 });
        // "53,000 years" reads better than "53 thousand years".
        expect(describeMagnitude(53_000)).toEqual({ kind: "plain", value: 53_000 });
        expect(describeMagnitude(999_999)).toEqual({ kind: "plain", value: 999_999 });
    });

    test("names the magnitude from a million up", () => {
        expect(describeMagnitude(1_000_000)).toEqual({
            kind: "scaled",
            value: 1,
            scale: "million",
        });
        expect(describeMagnitude(180_000_000)).toEqual({
            kind: "scaled",
            value: 180,
            scale: "million",
        });
        // The figure the password generator shows for its own defaults.
        expect(describeMagnitude(4.1e20)).toEqual({
            kind: "scaled",
            value: 410,
            scale: "quintillion",
        });
    });

    test("carries the mantissa into the next name instead of printing 1,000 of the last", () => {
        // 9.96 × 10²⁰ rounds to 1.0 × 10²¹ — a sextillion, not 1,000 quintillion.
        expect(describeMagnitude(9.96e20)).toEqual({
            kind: "scaled",
            value: 1,
            scale: "sextillion",
        });
        expect(describeMagnitude(999_999_999)).toEqual({
            kind: "scaled",
            value: 1,
            scale: "billion",
        });
    });

    test("keeps a negative sign on the mantissa", () => {
        expect(describeMagnitude(-2_200_000)).toEqual({
            kind: "scaled",
            value: -2.2,
            scale: "million",
        });
    });

    test("covers every name in the table", () => {
        for (const [index, scale] of MAGNITUDE_SCALES.entries()) {
            // The table starts at a million, so the first entry is 10⁶.
            expect(describeMagnitude(4.2 * 10 ** (3 * (index + 2)))).toEqual({
                kind: "scaled",
                value: 4.2,
                scale,
            });
        }
    });

    test("falls back to a power of ten once the names run out", () => {
        // One past a decillion, which is the last name worth printing.
        expect(describeMagnitude(1e36)).toEqual({ kind: "power", value: 1, exponent: 36 });
        expect(describeMagnitude(1.5e233)).toEqual({ kind: "power", value: 1.5, exponent: 233 });
    });

    test("does not invent a magnitude for a value a double cannot hold", () => {
        expect(describeMagnitude(Number.POSITIVE_INFINITY)).toEqual({
            kind: "plain",
            value: Number.POSITIVE_INFINITY,
        });
        expect(describeMagnitude(Number.NaN)).toEqual({ kind: "plain", value: Number.NaN });
    });

    test("leaves no float dust in the mantissa", () => {
        // 4.1 × 10² is 410.00000000000006 in binary floating point.
        const magnitude = describeMagnitude(4.1e20);

        expect(magnitude.kind).toBe("scaled");
        expect(magnitude.value).toBe(410);
    });
});

describe("superscript", () => {
    test("maps every digit to its superscript glyph", () => {
        expect(superscript(1234567890)).toBe("¹²³⁴⁵⁶⁷⁸⁹⁰");
        expect(superscript(11)).toBe("¹¹");
    });

    test("carries a minus sign", () => {
        expect(superscript(-6)).toBe("⁻⁶");
    });
});
