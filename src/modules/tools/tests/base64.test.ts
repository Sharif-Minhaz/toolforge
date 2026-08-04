import { describe, expect, test } from "bun:test";

import {
    base64ToBytes,
    bytesToBase64,
    bytesToDataUri,
    URL_SAFE_BASE64_ALPHABET,
} from "@/modules/tools/domain/base64";

/** RFC 4648 §10, the published ladder — not vectors invented here. */
const RFC_4648_VECTORS = [
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg=="],
    ["fooba", "Zm9vYmE="],
    ["foobar", "Zm9vYmFy"],
] as const;

describe("bytesToBase64", () => {
    for (const [text, expected] of RFC_4648_VECTORS) {
        test(`encodes ${JSON.stringify(text)} as ${JSON.stringify(expected)}`, () => {
            expect(bytesToBase64(new TextEncoder().encode(text))).toBe(expected);
        });
    }

    test("drops padding when asked", () => {
        expect(bytesToBase64(new TextEncoder().encode("f"), undefined, false)).toBe("Zg");
    });
});

describe("base64ToBytes", () => {
    for (const [text, encoded] of RFC_4648_VECTORS) {
        test(`reads ${JSON.stringify(encoded)} back as ${JSON.stringify(text)}`, () => {
            const bytes = base64ToBytes(encoded);

            expect(bytes).not.toBeNull();
            expect(new TextDecoder().decode(bytes ?? new Uint8Array(0))).toBe(text);
        });
    }

    test("round-trips every byte value", () => {
        const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);

        expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    });

    test("accepts an unpadded payload", () => {
        expect(base64ToBytes("Zm8")).toEqual(new TextEncoder().encode("fo"));
    });

    test("ignores the wrapping a pasted blob arrives with", () => {
        expect(base64ToBytes("Zm9v\nYmFy")).toEqual(new TextEncoder().encode("foobar"));
        expect(base64ToBytes("  Zm9vYmFy  ")).toEqual(new TextEncoder().encode("foobar"));
    });

    test("reads the URL-safe alphabet, which cannot be confused with the standard one", () => {
        const bytes = new Uint8Array([0xfb, 0xff]);

        expect(bytesToBase64(bytes, URL_SAFE_BASE64_ALPHABET)).toBe("-_8=");
        expect(base64ToBytes("-_8=")).toEqual(bytes);
        expect(base64ToBytes("+/8=")).toEqual(bytes);
    });

    test("rejects a symbol outside either alphabet", () => {
        expect(base64ToBytes("Zm9v*g==")).toBeNull();
    });

    test("rejects a remainder of one symbol, which carries no whole byte", () => {
        expect(base64ToBytes("Zm9vY")).toBeNull();
    });
});

describe("bytesToDataUri", () => {
    test("writes the standard, padded form RFC 2397 defines", () => {
        expect(bytesToDataUri(new TextEncoder().encode("f"), "text/plain")).toBe(
            "data:text/plain;base64,Zg==",
        );
    });
});
