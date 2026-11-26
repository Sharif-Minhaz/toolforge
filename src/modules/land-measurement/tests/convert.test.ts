import { describe, expect, test } from "bun:test";

import {
    DEFAULT_LAND_OPTIONS,
    MAX_LAND_INPUT_LENGTH,
} from "@/modules/land-measurement/domain/constants";
import { convertLand } from "@/modules/land-measurement/domain/convert";
import type { LandOptions, LandSuccess, LandUnit } from "@/modules/land-measurement/types";

function convert(input: string, overrides: Partial<LandOptions> = {}): LandSuccess {
    const result = convertLand(input, { ...DEFAULT_LAND_OPTIONS, ...overrides });

    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result;
}

function valueIn(result: LandSuccess, unit: LandUnit): number {
    const row = result.conversions.find((conversion) => conversion.unit === unit);

    if (row === undefined) {
        throw new Error(`no row for ${unit}`);
    }

    return row.value;
}

/**
 * The figures below are the published ones, not this module's own arithmetic
 * read back: Wikipedia's Katha, Bigha and Decimal articles and the land
 * record's own table (1 গণ্ডা = 864 sq ft, 20 গণ্ডা = 1 কানি, 4 কড়া = 1
 * গণ্ডা, 3 ক্রান্তি = 1 কড়া, 20 তিল = 1 ক্রান্তি).
 */
describe("the standard units against their published sizes", () => {
    test("a কাঠা is 720 sq ft, 80 sq yd and 1.6529 শতাংশ", () => {
        const katha = convert("1", { unit: "katha" });

        expect(valueIn(katha, "square-foot")).toBeCloseTo(720, 9);
        expect(valueIn(katha, "square-yard")).toBeCloseTo(80, 9);
        expect(valueIn(katha, "decimal")).toBeCloseTo(1.65289, 5);
        expect(valueIn(katha, "chhatak")).toBeCloseTo(16, 9);
        expect(valueIn(katha, "square-hand")).toBeCloseTo(320, 9);
        expect(valueIn(katha, "square-meter")).toBeCloseTo(66.8902, 4);
    });

    test("a বিঘা is 20 কাঠা, 14,400 sq ft and 1,600 sq yd", () => {
        const bigha = convert("1", { unit: "bigha" });

        expect(valueIn(bigha, "katha")).toBeCloseTo(20, 9);
        expect(valueIn(bigha, "square-foot")).toBeCloseTo(14_400, 9);
        expect(valueIn(bigha, "square-yard")).toBeCloseTo(1_600, 9);
        expect(valueIn(bigha, "decimal")).toBeCloseTo(33.0579, 4);
    });

    test("an acre is 3.025 বিঘা, 100 শতাংশ and 10,000 অযুতাংশ", () => {
        const acre = convert("1", { unit: "acre" });

        expect(valueIn(acre, "bigha")).toBeCloseTo(3.025, 9);
        expect(valueIn(acre, "decimal")).toBeCloseTo(100, 9);
        expect(valueIn(acre, "ojutangsho")).toBeCloseTo(10_000, 6);
        expect(valueIn(acre, "square-meter")).toBeCloseTo(4_046.8564224, 6);
    });

    test("a শতাংশ is 435.6 sq ft and 48.4 sq yd", () => {
        const decimal = convert("1", { unit: "decimal" });

        expect(valueIn(decimal, "square-foot")).toBeCloseTo(435.6, 9);
        expect(valueIn(decimal, "square-yard")).toBeCloseTo(48.4, 9);
    });

    test("a hectare is 10,000 m² and 2.4711 acres", () => {
        const hectare = convert("1", { unit: "hectare" });

        expect(valueIn(hectare, "square-meter")).toBeCloseTo(10_000, 6);
        expect(valueIn(hectare, "acre")).toBeCloseTo(2.471054, 6);
        expect(valueIn(hectare, "square-kilometer")).toBeCloseTo(0.01, 12);
    });

    test("the কানি chain: 20 গণ্ডা of 864 sq ft, down to a তিল of 3.6 sq ft", () => {
        const kani = convert("1", { unit: "kani" });

        expect(valueIn(kani, "gonda")).toBeCloseTo(20, 9);
        expect(valueIn(kani, "kora")).toBeCloseTo(80, 9);
        expect(valueIn(kani, "kranti")).toBeCloseTo(240, 9);
        expect(valueIn(kani, "til")).toBeCloseTo(4_800, 9);
        expect(valueIn(kani, "square-foot")).toBeCloseTo(17_280, 9);

        const gonda = convert("1", { unit: "gonda" });
        expect(valueIn(gonda, "square-foot")).toBeCloseTo(864, 9);

        const til = convert("1", { unit: "til" });
        expect(valueIn(til, "square-foot")).toBeCloseTo(3.6, 9);
    });
});

describe("regional sizes", () => {
    test("a Faridpur বিঘা is 52 শতাংশ, and its কাঠা a twentieth of that", () => {
        const bigha = convert("1", { unit: "bigha", bighaRegion: "faridpur" });

        expect(valueIn(bigha, "decimal")).toBeCloseTo(52, 9);
        expect(valueIn(bigha, "katha")).toBeCloseTo(20, 9);

        const katha = convert("1", { unit: "katha", bighaRegion: "faridpur" });
        expect(valueIn(katha, "decimal")).toBeCloseTo(2.6, 9);
    });

    test("a Comilla/Noakhali কানি is 120 শতাংশ, and its গণ্ডা 6 — as Banglapedia's Noakhali গণ্ডা is", () => {
        const kani = convert("1", { unit: "kani", kaniRegion: "comilla-noakhali" });

        expect(valueIn(kani, "decimal")).toBeCloseTo(120, 9);
        expect(valueIn(kani, "gonda")).toBeCloseTo(20, 9);

        const gonda = convert("1", { unit: "gonda", kaniRegion: "comilla-noakhali" });
        expect(valueIn(gonda, "decimal")).toBeCloseTo(6, 9);
    });

    test("a Chittagong কানি is 160 শতাংশ, and its গণ্ডা 8", () => {
        const gonda = convert("1", { unit: "gonda", kaniRegion: "chittagong" });

        expect(valueIn(gonda, "decimal")).toBeCloseTo(8, 9);
    });

    test("a region leaves the units outside its chain alone", () => {
        const standard = convert("1", { unit: "acre" });
        const regional = convert("1", {
            unit: "acre",
            bighaRegion: "rangpur",
            kaniRegion: "chittagong",
        });

        for (const unit of ["decimal", "square-foot", "hectare", "square-hand"] as const) {
            expect(valueIn(regional, unit)).toBe(valueIn(standard, unit));
        }
        expect(valueIn(regional, "bigha")).toBeCloseTo(100 / 60, 9);
    });
});

describe("convertLand", () => {
    test("hands the typed unit back exactly as typed", () => {
        expect(valueIn(convert("5", { unit: "katha" }), "katha")).toBe(5);
        expect(valueIn(convert("0.1", { unit: "hectare" }), "hectare")).toBe(0.1);
    });

    test("reads Bangla digits and grouping commas", () => {
        expect(convert("১২.৫").value).toBe(12.5);
        expect(convert("1,250").value).toBe(1250);
        expect(convert("১,২৫০").value).toBe(1250);
    });

    test("zero is an answer, not a refusal", () => {
        const zero = convert("0");

        expect(zero.squareFeet).toBe(0);
        expect(zero.pitches.drawnPitches).toBe(1);
        expect(zero.pitches.remainder).toBeNull();
    });

    test("refuses a negative area by name", () => {
        expect(convertLand("-5", DEFAULT_LAND_OPTIONS)).toEqual({
            ok: false,
            reason: "negative",
            position: 1,
        });
    });

    test("refuses an area past the ceiling", () => {
        expect(
            convertLand("1000000", { ...DEFAULT_LAND_OPTIONS, unit: "square-kilometer" }),
        ).toEqual({ ok: false, reason: "too_large" });
        expect(convertLand("9".repeat(MAX_LAND_INPUT_LENGTH + 1), DEFAULT_LAND_OPTIONS)).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("returns a row for every unit, local units first", () => {
        const result = convert("1");

        expect(result.conversions).toHaveLength(17);
        expect(result.conversions[0]).toMatchObject({ unit: "bigha", group: "local" });
        expect(result.conversions.at(-1)).toMatchObject({
            unit: "square-yard",
            group: "international",
        });
    });
});
