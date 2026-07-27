import { describe, expect, test } from "bun:test";

import {
    decodeBase64UrlToBytes,
    decodeBase64UrlToText,
    encodeBytesToBase64Url,
    encodeTextToBase64Url,
} from "@/modules/jwt/domain/base64url";

/**
 * RFC 4648 §10, with padding stripped as JOSE requires. Published vectors, not
 * values produced by the code under test.
 */
const RFC_4648_LADDER: readonly (readonly [string, string])[] = [
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
    ["fooba", "Zm9vYmE"],
    ["foobar", "Zm9vYmFy"],
];

/** `0xfb 0xff` is `+/8=` in the standard alphabet — both substituted characters. */
const ALPHABET_TAIL = new Uint8Array([0xfb, 0xff]);

function decodedBytes(segment: string): Uint8Array {
    const result = decodeBase64UrlToBytes(segment);

    if (!result.ok) {
        throw new Error(`expected a successful decode, got ${result.reason}`);
    }

    return result.bytes;
}

describe("encodeTextToBase64Url", () => {
    test("matches the RFC 4648 ladder without padding", () => {
        for (const [plain, encoded] of RFC_4648_LADDER) {
            expect(encodeTextToBase64Url(plain)).toBe(encoded);
        }
    });

    test("uses the URL-safe alphabet", () => {
        expect(encodeBytesToBase64Url(ALPHABET_TAIL)).toBe("-_8");
    });

    test("never emits padding", () => {
        for (const [plain] of RFC_4648_LADDER) {
            expect(encodeTextToBase64Url(plain)).not.toContain("=");
        }
    });
});

describe("decodeBase64UrlToText", () => {
    test("reverses the RFC 4648 ladder", () => {
        for (const [plain, encoded] of RFC_4648_LADDER) {
            expect(decodeBase64UrlToText(encoded)).toEqual({ ok: true, text: plain });
        }
    });

    test("reads the URL-safe alphabet back to the original bytes", () => {
        expect(decodedBytes("-_8")).toEqual(ALPHABET_TAIL);
    });

    test("round-trips multi-byte text", () => {
        const text = "ঢাকা — 東京 🔐";

        expect(decodeBase64UrlToText(encodeTextToBase64Url(text))).toEqual({ ok: true, text });
    });

    test("rejects standard-alphabet characters", () => {
        expect(decodeBase64UrlToText("+/8=")).toEqual({ ok: false, reason: "invalid_character" });
    });

    test("rejects padding, which JOSE strips", () => {
        expect(decodeBase64UrlToText("Zm8=")).toEqual({ ok: false, reason: "invalid_character" });
    });

    test("rejects a length that cannot end a byte", () => {
        expect(decodeBase64UrlToText("Zm9vY")).toEqual({ ok: false, reason: "invalid_length" });
    });

    test("reports bytes that are not UTF-8 text", () => {
        // 0x80 is a continuation byte with nothing to continue.
        expect(decodeBase64UrlToText(encodeBytesToBase64Url(new Uint8Array([0x80])))).toEqual({
            ok: false,
            reason: "undecodable_text",
        });
    });

    test("still returns those bytes when text is not asked for", () => {
        expect(decodedBytes(encodeBytesToBase64Url(new Uint8Array([0x80])))).toEqual(
            new Uint8Array([0x80]),
        );
    });

    test("decodes the empty segment an unsigned token carries", () => {
        expect(decodedBytes("")).toEqual(new Uint8Array([]));
    });
});
