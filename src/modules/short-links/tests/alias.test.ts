import { describe, expect, test } from "bun:test";

import { isReservedAlias, normalizeAlias, parseAlias } from "@/modules/short-links/domain/alias";
import { ALIAS_LENGTH, RESERVED_ALIASES } from "@/modules/short-links/domain/constants";

describe("normalizeAlias", () => {
    test("folds casing and surrounding space", () => {
        expect(normalizeAlias("  Summer-Sale  ")).toBe("summer-sale");
    });

    test("turns typed spaces into hyphens, however many", () => {
        expect(normalizeAlias("summer   sale 2026")).toBe("summer-sale-2026");
    });

    test("leaves anything else alone, so it can fail loudly", () => {
        expect(normalizeAlias("summer/sale")).toBe("summer/sale");
    });
});

describe("parseAlias", () => {
    test("accepts a normalised alias", () => {
        expect(parseAlias("Summer Sale")).toEqual({ ok: true, alias: "summer-sale" });
        expect(parseAlias("q3-2026")).toEqual({ ok: true, alias: "q3-2026" });
    });

    test("holds both ends of the length range", () => {
        const shortest = "a".repeat(ALIAS_LENGTH.min);
        const longest = "a".repeat(ALIAS_LENGTH.max);

        expect(parseAlias(shortest)).toEqual({ ok: true, alias: shortest });
        expect(parseAlias(longest)).toEqual({ ok: true, alias: longest });
        expect(parseAlias("a".repeat(ALIAS_LENGTH.min - 1))).toEqual({
            ok: false,
            reason: "too_short",
        });
        expect(parseAlias("a".repeat(ALIAS_LENGTH.max + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("refuses hyphens at the edges and doubled hyphens", () => {
        for (const value of ["-lead", "trail-", "a--b"]) {
            expect(parseAlias(value)).toEqual({ ok: false, reason: "invalid_characters" });
        }
    });

    test("refuses characters that would change what the path means", () => {
        for (const value of ["sale/2026", "sale?x=1", "sale#top", "sale%2f", "sale.json"]) {
            expect(parseAlias(value)).toEqual({ ok: false, reason: "invalid_characters" });
        }
    });

    test("refuses a reserved word, in any casing", () => {
        expect(parseAlias("login")).toEqual({ ok: false, reason: "reserved" });
        expect(parseAlias("  LOGIN ")).toEqual({ ok: false, reason: "reserved" });
    });

    test("every reserved word is itself a well-formed alias, or it is dead weight", () => {
        for (const reserved of RESERVED_ALIASES) {
            expect(isReservedAlias(reserved)).toBe(true);
            expect(reserved).toBe(normalizeAlias(reserved));
            expect(reserved.length).toBeGreaterThanOrEqual(ALIAS_LENGTH.min);
            expect(parseAlias(reserved)).toEqual({ ok: false, reason: "reserved" });
        }
    });

    test("the reserved list holds the words a phishing link would want", () => {
        for (const word of ["login", "verify", "secure", "account", "wallet"]) {
            expect(RESERVED_ALIASES).toContain(word);
        }
    });
});
