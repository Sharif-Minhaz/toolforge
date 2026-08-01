import { describe, expect, test } from "bun:test";

import {
    EDIT_TOKEN_LENGTH,
    SLUG_ALPHABET,
    SLUG_LENGTH,
    MAX_TARGET_URL_LENGTH,
} from "@/modules/qr/domain/constants";
import {
    buildEditUrl,
    buildShortUrl,
    createEditToken,
    createSlug,
    hashEditToken,
    isSelfReferential,
    isValidEditToken,
    isValidSlug,
    parseTargetUrl,
} from "@/modules/qr/domain/short-code";
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
    test("a slug is the right length, from the right alphabet", () => {
        const slug = createSlug(seededBytes(1));

        expect(slug).toHaveLength(SLUG_LENGTH);
        expect([...slug].every((character) => SLUG_ALPHABET.includes(character))).toBe(true);
        expect(isValidSlug(slug)).toBe(true);
    });

    test("an edit token is far longer than a slug", () => {
        const token = createEditToken(seededBytes(2));

        expect(token).toHaveLength(EDIT_TOKEN_LENGTH);
        expect(isValidEditToken(token)).toBe(true);
        expect(isValidSlug(token)).toBe(false);
    });

    test("the alphabet carries no vowels or look-alike glyphs", () => {
        for (const character of "aeiou01lIO") {
            expect(SLUG_ALPHABET).not.toContain(character);
        }
    });

    test("different sources produce different values", () => {
        expect(createSlug(seededBytes(1))).not.toBe(createSlug(seededBytes(9)));
    });

    test("validation rejects the wrong length and the wrong alphabet", () => {
        expect(isValidSlug("")).toBe(false);
        expect(isValidSlug("bcdfghj")).toBe(false);
        expect(isValidSlug("bcdfghjkm")).toBe(false);
        expect(isValidSlug("bcdfghja")).toBe(false);
        expect(isValidEditToken("b".repeat(EDIT_TOKEN_LENGTH - 1))).toBe(false);
    });
});

describe("hashEditToken", () => {
    test("is a stable 64-character hex digest", async () => {
        const digest = await hashEditToken("bcdfghjk");

        expect(digest).toMatch(/^[0-9a-f]{64}$/);
        expect(await hashEditToken("bcdfghjk")).toBe(digest);
    });

    test("a different token gives a different digest", async () => {
        expect(await hashEditToken("bcdfghjk")).not.toBe(await hashEditToken("bcdfghjm"));
    });

    test("matches the published SHA-256 vector for the empty string", async () => {
        expect(await hashEditToken("")).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });
});

describe("parseTargetUrl", () => {
    test("accepts http and https", () => {
        expect(parseTargetUrl("https://example.com/a")).toEqual({
            ok: true,
            url: "https://example.com/a",
        });
        expect(parseTargetUrl("http://example.com")).toEqual({
            ok: true,
            url: "http://example.com/",
        });
    });

    test("prefixes a bare host, which is what the paste meant", () => {
        expect(parseTargetUrl("example.com/promo")).toEqual({
            ok: true,
            url: "https://example.com/promo",
        });
    });

    test("refuses a scheme a redirect must never carry", () => {
        for (const raw of [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "vbscript:msgbox",
        ]) {
            expect(parseTargetUrl(raw)).toEqual({ ok: false, reason: "unsupported_scheme" });
        }
    });

    test("refuses an empty, over-long, or unparseable value", () => {
        expect(parseTargetUrl("   ")).toEqual({ ok: false, reason: "empty" });
        expect(parseTargetUrl(`https://example.com/${"a".repeat(MAX_TARGET_URL_LENGTH)}`)).toEqual({
            ok: false,
            reason: "too_long",
        });
        expect(parseTargetUrl("https://")).toEqual({ ok: false, reason: "not_a_url" });
    });
});

describe("isSelfReferential", () => {
    const origin = "https://toolforge.example";

    test("catches a short link pointing at another short link", () => {
        expect(isSelfReferential("https://toolforge.example/q/bcdfghjk", origin)).toBe(true);
        expect(isSelfReferential("https://toolforge.example/q", origin)).toBe(true);
    });

    test("leaves ordinary links on the same host alone", () => {
        expect(isSelfReferential("https://toolforge.example/tools/qr", origin)).toBe(false);
        expect(isSelfReferential("https://toolforge.example/quarterly", origin)).toBe(false);
    });

    test("another host is never self-referential", () => {
        expect(isSelfReferential("https://example.com/q/bcdfghjk", origin)).toBe(false);
    });

    test("an unparseable value is not treated as a loop", () => {
        expect(isSelfReferential("not a url", origin)).toBe(false);
    });
});

describe("url building", () => {
    test("builds the printed link and the owner's link", () => {
        expect(buildShortUrl("bcdfghjk", "https://toolforge.example")).toBe(
            "https://toolforge.example/q/bcdfghjk",
        );
        expect(buildEditUrl("b".repeat(40), "https://toolforge.example/")).toBe(
            `https://toolforge.example/tools/qr/edit/${"b".repeat(40)}`,
        );
    });
});
