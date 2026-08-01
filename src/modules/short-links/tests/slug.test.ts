import { describe, expect, test } from "bun:test";

import {
    ALIAS_LENGTH,
    EDIT_TOKEN_LENGTH,
    SLUG_ALPHABET,
    SLUG_LENGTH,
} from "@/modules/short-links/domain/constants";
import {
    createEditToken,
    createSlug,
    hashEditToken,
    isDrawnSlug,
    isResolvableSlug,
    isValidEditToken,
} from "@/modules/short-links/domain/slug";
import type { RandomBytes } from "@/modules/tools/types";

/** Deterministic byte source, so every assertion below is reproducible. */
function seededBytes(seed: number): RandomBytes {
    let state = seed >>> 0;

    return (length) => {
        const bytes = new Uint8Array(length);

        for (let index = 0; index < length; index += 1) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            bytes[index] = (state >>> 24) & 0xff;
        }

        return bytes;
    };
}

describe("identifiers", () => {
    test("a drawn slug is the right length, from the right alphabet", () => {
        const slug = createSlug(seededBytes(1));

        expect(slug).toHaveLength(SLUG_LENGTH);
        expect([...slug].every((character) => SLUG_ALPHABET.includes(character))).toBe(true);
        expect(isDrawnSlug(slug)).toBe(true);
    });

    test("an edit token is far longer than a slug", () => {
        const token = createEditToken(seededBytes(2));

        expect(token).toHaveLength(EDIT_TOKEN_LENGTH);
        expect(isValidEditToken(token)).toBe(true);
        expect(isDrawnSlug(token)).toBe(false);
    });

    test("the alphabet carries no vowels or look-alike glyphs", () => {
        for (const character of "aeiou01lIO") {
            expect(SLUG_ALPHABET).not.toContain(character);
        }
    });

    test("a different source draws a different slug", () => {
        expect(createSlug(seededBytes(7))).not.toBe(createSlug(seededBytes(8)));
    });
});

describe("isResolvableSlug", () => {
    test("admits every slug this service draws", () => {
        for (let seed = 1; seed <= 40; seed += 1) {
            expect(isResolvableSlug(createSlug(seededBytes(seed)))).toBe(true);
        }
    });

    test("admits a chosen alias, because both share one keyspace", () => {
        expect(isResolvableSlug("summer-sale")).toBe(true);
        expect(isResolvableSlug("q3")).toBe(false);
        expect(isResolvableSlug("q3x")).toBe(true);
    });

    test("refuses anything that could not be a row", () => {
        for (const value of [
            "",
            "ab",
            "Summer",
            "has space",
            "-leading",
            "trailing-",
            "double--hyphen",
            "slash/inside",
            "dot.inside",
            "a".repeat(ALIAS_LENGTH.max + 1),
        ]) {
            expect(isResolvableSlug(value)).toBe(false);
        }
    });
});

describe("isValidEditToken", () => {
    test("length and alphabet both have to match", () => {
        const token = createEditToken(seededBytes(3));

        expect(isValidEditToken(token.slice(0, -1))).toBe(false);
        expect(isValidEditToken(`${token}b`)).toBe(false);
        expect(isValidEditToken(`a${token.slice(1)}`)).toBe(false);
    });
});

describe("hashEditToken", () => {
    test("is a 64-character hex digest", async () => {
        const digest = await hashEditToken("abc");

        expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    test("is stable for one token and different for another", async () => {
        const [first, again, other] = await Promise.all([
            hashEditToken("token-one"),
            hashEditToken("token-one"),
            hashEditToken("token-two"),
        ]);

        expect(first).toBe(again);
        expect(first).not.toBe(other);
    });

    test("never returns the token it was given", async () => {
        const token = createEditToken(seededBytes(4));

        expect(await hashEditToken(token)).not.toContain(token);
    });
});
