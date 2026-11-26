import { describe, expect, test } from "bun:test";

import { parseNumber } from "@/modules/number-to-words/domain/parse";

describe("parseNumber", () => {
    test("reads a plain whole number", () => {
        expect(parseNumber("1250")).toEqual({
            ok: true,
            value: { negative: false, integer: "1250", fraction: "" },
        });
    });

    test("accepts grouping commas, spaces and underscores between digits", () => {
        for (const typed of ["12,50,500", "1,250,500", "1 250 500", "1_250_500"]) {
            expect(parseNumber(typed)).toMatchObject({ ok: true, value: { integer: "1250500" } });
        }
    });

    test("reads Bangla digits as the digits they are", () => {
        expect(parseNumber("১২,৩৪৫.৬৭")).toEqual({
            ok: true,
            value: { negative: false, integer: "12345", fraction: "67" },
        });
    });

    test("keeps the fraction exactly as typed and drops leading zeros from the whole part", () => {
        expect(parseNumber("007.50")).toEqual({
            ok: true,
            value: { negative: false, integer: "7", fraction: "50" },
        });
        expect(parseNumber(".5")).toMatchObject({
            ok: true,
            value: { integer: "0", fraction: "5" },
        });
    });

    test("reads a sign, including the Unicode minus", () => {
        expect(parseNumber("-3")).toMatchObject({ ok: true, value: { negative: true } });
        expect(parseNumber("−3")).toMatchObject({ ok: true, value: { negative: true } });
        expect(parseNumber("+3")).toMatchObject({ ok: true, value: { negative: false } });
    });

    test("ignores surrounding whitespace", () => {
        expect(parseNumber("  42 \n")).toMatchObject({ ok: true, value: { integer: "42" } });
    });

    test("names each refusal and points at the character", () => {
        expect(parseNumber("")).toEqual({ ok: false, reason: "empty" });
        expect(parseNumber("   ")).toEqual({ ok: false, reason: "empty" });
        expect(parseNumber("12a")).toEqual({ ok: false, reason: "invalid_character", position: 3 });
        expect(parseNumber("1.2.3")).toEqual({ ok: false, reason: "too_many_points", position: 4 });
        expect(parseNumber(",123")).toEqual({
            ok: false,
            reason: "misplaced_separator",
            position: 1,
        });
        expect(parseNumber("123,")).toEqual({
            ok: false,
            reason: "misplaced_separator",
            position: 4,
        });
        expect(parseNumber("1,,2")).toEqual({
            ok: false,
            reason: "misplaced_separator",
            position: 2,
        });
        expect(parseNumber("1.2,3")).toEqual({
            ok: false,
            reason: "misplaced_separator",
            position: 4,
        });
        expect(parseNumber("5-")).toEqual({ ok: false, reason: "misplaced_sign", position: 2 });
        expect(parseNumber("-")).toEqual({ ok: false, reason: "no_digits" });
        expect(parseNumber(".")).toEqual({ ok: false, reason: "no_digits" });
    });

    test("counts positions in characters, so an emoji earlier does not throw it off", () => {
        expect(parseNumber("😀")).toEqual({ ok: false, reason: "invalid_character", position: 1 });
        expect(parseNumber("1😀")).toEqual({ ok: false, reason: "invalid_character", position: 2 });
    });

    test("counts positions from the start of what was typed, leading spaces included", () => {
        expect(parseNumber("  1x")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 4,
        });
    });
});
