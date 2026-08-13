import { describe, expect, test } from "bun:test";

import { bytesToBase64, isBase64, utf8ByteLength } from "@/modules/hash/domain/encoding";

// Hex moved to `tools/domain/hex.ts` once the BSON converter needed it too;
// its assertions travelled with it to `tools/tests/hex.test.ts`. `timingSafeEqual`
// followed the same road to `tools/domain/timing-safe.ts` when the MCP endpoint
// needed it for its bearer token.

describe("bytesToBase64", () => {
    for (const [bytes, expected] of [
        [[], ""],
        [[0x66], "Zg=="],
        [[0x66, 0x6f], "Zm8="],
        [[0x66, 0x6f, 0x6f], "Zm9v"],
    ] as const) {
        test(`encodes ${bytes.length} bytes as ${JSON.stringify(expected)}`, () => {
            expect(bytesToBase64(new Uint8Array(bytes))).toBe(expected);
        });
    }

    test("survives bytes above 0x7f", () => {
        expect(bytesToBase64(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe("//79");
    });
});

describe("isBase64", () => {
    test("accepts padded quads", () => {
        expect(isBase64("Zm9v")).toBe(true);
        expect(isBase64("Zm8=")).toBe(true);
        expect(isBase64("Zg==")).toBe(true);
    });

    test("rejects an unpadded remainder", () => {
        expect(isBase64("Zm8")).toBe(false);
    });

    test("rejects URL-safe characters, which a digest box never carries", () => {
        expect(isBase64("ab-d")).toBe(false);
        expect(isBase64("ab_d")).toBe(false);
    });
});

describe("utf8ByteLength", () => {
    for (const [text, bytes] of [
        ["", 0],
        ["abc", 3],
        ["é", 2],
        ["স", 3],
        ["🔐", 4],
    ] as const) {
        test(`counts ${JSON.stringify(text)} as ${bytes} bytes`, () => {
            expect(utf8ByteLength(text)).toBe(bytes);
        });
    }

    test("differs from the code-unit count for astral characters", () => {
        expect("🔐".length).toBe(2);
        expect(utf8ByteLength("🔐")).toBe(4);
    });
});
