import { describe, expect, test } from "bun:test";

import {
    MAX_AES_SECRET_LENGTH,
    MAX_PBKDF2_ITERATIONS,
    MIN_PBKDF2_ITERATIONS,
} from "../domain/constants";
import { aesKeyCacheKey, resolveAesKey, usesKeyDerivation } from "../domain/key";
import type { AesKeyInput } from "../types";

function input(overrides: Partial<AesKeyInput> = {}): AesKeyInput {
    return {
        source: "passphrase",
        secret: "correct horse battery staple",
        saltHex: "18446f781c8f697caef3609ac74783f7",
        iterations: MIN_PBKDF2_ITERATIONS,
        keySize: 256,
        ...overrides,
    };
}

describe("usesKeyDerivation", () => {
    test("is true only for a passphrase", () => {
        expect(usesKeyDerivation("passphrase")).toBe(true);
        expect(usesKeyDerivation("hex")).toBe(false);
        expect(usesKeyDerivation("base64")).toBe(false);
    });
});

describe("resolveAesKey, deriving from a passphrase", () => {
    test("produces exactly the requested width", async () => {
        for (const keySize of [128, 192, 256] as const) {
            const key = await resolveAesKey(input({ keySize }));

            expect(key.ok && key.bytes.length).toBe(keySize / 8);
        }
    });

    test("refuses an empty secret before doing any work", async () => {
        expect(await resolveAesKey(input({ secret: "" }))).toEqual({
            ok: false,
            reason: "empty_key",
        });
    });

    test("refuses a secret past the ceiling rather than truncating it", async () => {
        const long = "a".repeat(MAX_AES_SECRET_LENGTH + 1);

        expect(await resolveAesKey(input({ secret: long }))).toEqual({
            ok: false,
            reason: "key_too_large",
        });
    });

    test("refuses a salt that is not hex", async () => {
        expect(await resolveAesKey(input({ saltHex: "not-hex" }))).toEqual({
            ok: false,
            reason: "invalid_salt",
        });
    });

    test("refuses an empty salt", async () => {
        expect(await resolveAesKey(input({ saltHex: "" }))).toEqual({
            ok: false,
            reason: "invalid_salt",
        });
    });

    test("accepts a salt of a width another system chose", async () => {
        // Eight bytes is what OpenSSL's own envelope carries, and a reader
        // checking that system's output has to be able to paste it here.
        const key = await resolveAesKey(input({ saltHex: "0102030405060708" }));

        expect(key.ok).toBe(true);
    });

    test("refuses an iteration count outside the range", async () => {
        for (const iterations of [MIN_PBKDF2_ITERATIONS - 1, MAX_PBKDF2_ITERATIONS + 1, 1.5]) {
            expect(await resolveAesKey(input({ iterations }))).toEqual({
                ok: false,
                reason: "invalid_iterations",
            });
        }
    });

    test("gives a different key for a different salt", async () => {
        const first = await resolveAesKey(input());
        const second = await resolveAesKey(input({ saltHex: "ff".repeat(16) }));

        expect(first.ok && second.ok && first.bytes).not.toEqual(second.ok ? second.bytes : null);
    });
});

describe("resolveAesKey, reading a raw key", () => {
    const HEX_256 = "0f".repeat(32);

    test("takes a hex key of exactly the right width", async () => {
        const key = await resolveAesKey(input({ source: "hex", secret: HEX_256 }));

        expect(key.ok && [...key.bytes]).toEqual(Array.from({ length: 32 }, () => 0x0f));
    });

    test("takes a base64 key too", async () => {
        const key = await resolveAesKey(
            input({ source: "base64", secret: btoa("\x0f".repeat(32)) }),
        );

        expect(key.ok && key.bytes.length).toBe(32);
    });

    test("names the width it wanted and the width it got", async () => {
        expect(await resolveAesKey(input({ source: "hex", secret: "0f".repeat(16) }))).toEqual({
            ok: false,
            reason: "invalid_key_length",
            actualBytes: 16,
            expectedBytes: 32,
        });
    });

    test("refuses a key that does not parse", async () => {
        expect(await resolveAesKey(input({ source: "hex", secret: "zz".repeat(32) }))).toEqual({
            ok: false,
            reason: "invalid_key_encoding",
        });
    });

    test("reads a hex key pasted with whitespace in it", async () => {
        const spaced = Array.from({ length: 32 }, () => "0f").join(" ");
        const key = await resolveAesKey(input({ source: "hex", secret: spaced }));

        expect(key.ok).toBe(true);
    });

    test("ignores the salt and the iteration count entirely", async () => {
        const key = await resolveAesKey(
            input({ source: "hex", secret: HEX_256, saltHex: "not-hex", iterations: 0 }),
        );

        expect(key.ok).toBe(true);
    });
});

describe("aesKeyCacheKey", () => {
    test("changes when anything the derivation reads changes", () => {
        const base = aesKeyCacheKey(input());

        expect(aesKeyCacheKey(input({ secret: "other" }))).not.toBe(base);
        expect(aesKeyCacheKey(input({ saltHex: "ff".repeat(16) }))).not.toBe(base);
        expect(aesKeyCacheKey(input({ iterations: MIN_PBKDF2_ITERATIONS + 1 }))).not.toBe(base);
        expect(aesKeyCacheKey(input({ keySize: 128 }))).not.toBe(base);
    });

    test("treats hex salts as the same value whatever their case", () => {
        expect(aesKeyCacheKey(input({ saltHex: "AB".repeat(16) }))).toBe(
            aesKeyCacheKey(input({ saltHex: "ab".repeat(16) })),
        );
    });

    /** Redrawing a salt must not throw away a key that never depended on it. */
    test("ignores the salt and the iterations for a raw key", () => {
        const base = aesKeyCacheKey(input({ source: "hex", secret: "0f".repeat(32) }));

        expect(
            aesKeyCacheKey(
                input({
                    source: "hex",
                    secret: "0f".repeat(32),
                    saltHex: "ff".repeat(16),
                    iterations: 999_999,
                }),
            ),
        ).toBe(base);
    });
});
