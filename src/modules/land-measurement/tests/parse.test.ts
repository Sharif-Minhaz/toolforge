import { describe, expect, test } from "bun:test";

import { parseArea } from "@/modules/land-measurement/domain/parse";

describe("parseArea", () => {
    test("reads plain, decimal and leading-point numbers", () => {
        expect(parseArea("5")).toEqual({ ok: true, value: 5 });
        expect(parseArea("  2.75 ")).toEqual({ ok: true, value: 2.75 });
        expect(parseArea(".5")).toEqual({ ok: true, value: 0.5 });
        expect(parseArea("3.")).toEqual({ ok: true, value: 3 });
        expect(parseArea("+4")).toEqual({ ok: true, value: 4 });
    });

    test("reads Bangla digits", () => {
        expect(parseArea("৩৩.০৬")).toEqual({ ok: true, value: 33.06 });
    });

    test("allows a separator only between two whole-part digits", () => {
        expect(parseArea("12,500")).toEqual({ ok: true, value: 12500 });
        expect(parseArea("12 500")).toEqual({ ok: true, value: 12500 });
        expect(parseArea(",5")).toEqual({ ok: false, reason: "misplaced_separator", position: 1 });
        expect(parseArea("5,")).toEqual({ ok: false, reason: "misplaced_separator", position: 2 });
        expect(parseArea("1.2,5")).toEqual({
            ok: false,
            reason: "misplaced_separator",
            position: 4,
        });
    });

    test("names each refusal", () => {
        expect(parseArea("")).toEqual({ ok: false, reason: "empty" });
        expect(parseArea("   ")).toEqual({ ok: false, reason: "empty" });
        expect(parseArea(".")).toEqual({ ok: false, reason: "no_digits" });
        expect(parseArea("−3")).toEqual({ ok: false, reason: "negative", position: 1 });
        expect(parseArea("1.2.3")).toEqual({ ok: false, reason: "too_many_points", position: 4 });
        expect(parseArea("5 katha")).toEqual({
            ok: false,
            reason: "misplaced_separator",
            position: 2,
        });
        expect(parseArea("5k")).toEqual({ ok: false, reason: "invalid_character", position: 2 });
        expect(parseArea("1e5")).toEqual({ ok: false, reason: "invalid_character", position: 2 });
    });

    test("counts the position in characters, not code units", () => {
        expect(parseArea("৫x")).toEqual({ ok: false, reason: "invalid_character", position: 2 });
    });
});
