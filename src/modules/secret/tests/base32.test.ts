import { describe, expect, test } from "bun:test";

import { BASE32_ALPHABET, bytesToBase32 } from "@/modules/secret/domain/base32";

const ascii = (text: string) => new TextEncoder().encode(text);

/**
 * The ladder from RFC 4648 §10, copied from the specification rather than
 * produced by this encoder and pasted back in. A vector a tool generated for
 * itself proves only that it is consistent, which is exactly what a broken
 * encoder also is.
 *
 * Cross-checked against GNU coreutils `base32` while this was written; the
 * padded column is byte-for-byte what `printf 'foobar' | base32` prints.
 */
const RFC_4648_VECTORS: readonly (readonly [string, string])[] = [
    ["", ""],
    ["f", "MY======"],
    ["fo", "MZXQ===="],
    ["foo", "MZXW6==="],
    ["foob", "MZXW6YQ="],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI======"],
];

describe("bytesToBase32", () => {
    test("matches every RFC 4648 vector when padded", () => {
        for (const [input, expected] of RFC_4648_VECTORS) {
            expect(bytesToBase32(ascii(input), true)).toBe(expected);
        }
    });

    test("drops only the padding when unpadded", () => {
        for (const [input, expected] of RFC_4648_VECTORS) {
            expect(bytesToBase32(ascii(input), false)).toBe(expected.replace(/=+$/, ""));
        }
    });

    test("pads to a multiple of eight symbols", () => {
        for (let length = 0; length <= 40; length += 1) {
            const encoded = bytesToBase32(new Uint8Array(length), true);

            expect(encoded.length % 8).toBe(0);
        }
    });

    test("uses only the RFC alphabet and the pad character", () => {
        // Every byte value, so no bit pattern can reach outside the 32 symbols.
        const everyByte = Uint8Array.from({ length: 256 }, (_, index) => index);
        const allowed = new Set([...BASE32_ALPHABET, "="]);

        for (const symbol of bytesToBase32(everyByte, true)) {
            expect(allowed.has(symbol)).toBe(true);
        }
    });

    test("omits the digits that read as letters", () => {
        // 0/1/8 are absent from RFC 4648 base32 exactly as they are from
        // Crockford's — a decoder that saw one would be reading a typo.
        for (const digit of ["0", "1", "8", "9"]) {
            expect(BASE32_ALPHABET).not.toContain(digit);
        }
    });
});
