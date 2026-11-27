import { describe, expect, test } from "bun:test";

import { toDecimal } from "@/modules/zakat/domain/exact";
import { toGrams, toTraditional } from "@/modules/zakat/domain/units";

const grams = (weight: string, unit: Parameters<typeof toGrams>[1]) => {
    const value = toGrams(weight, unit);

    if (value === null) {
        throw new Error("unparseable");
    }

    return value;
};

describe("units", () => {
    test("7.5 vori is the Hanafi gold nisab, 87.48 g", () => {
        expect(toDecimal(grams("7.5", "vori"), 3)).toBe("87.480");
        expect(toDecimal(grams("52.5", "vori"), 3)).toBe("612.360");
    });

    test("16 ana, 96 rati, one troy ounce", () => {
        expect(toDecimal(grams("16", "ana"), 3)).toBe("11.664");
        expect(toDecimal(grams("96", "rati"), 3)).toBe("11.664");
        expect(toDecimal(grams("1", "ounce"), 7)).toBe("31.1034768");
    });

    test("grams back to vori · ana · rati · point", () => {
        expect(toTraditional(grams("87.48", "gram"))).toEqual({
            vori: 7,
            ana: 8,
            rati: 0,
            point: 0,
        });
        // 2 vori 5 ana 3 rati = 23.328 + 3.645 + 0.3645 g.
        expect(toTraditional(grams("27.3375", "gram"))).toEqual({
            vori: 2,
            ana: 5,
            rati: 3,
            point: 0,
        });
        expect(toTraditional(grams("0.01215", "gram"))).toEqual({
            vori: 0,
            ana: 0,
            rati: 0,
            point: 1,
        });
    });

    test("an unreadable weight is null", () => {
        expect(toGrams("abc", "gram")).toBeNull();
    });
});
