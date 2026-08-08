import { describe, expect, test } from "bun:test";

import {
    MAX_GCM_NONCE_BYTES,
    MAX_PBKDF2_ITERATIONS,
    MIN_PBKDF2_ITERATIONS,
    DEFAULT_PBKDF2_ITERATIONS,
} from "../domain/constants";
import { acceptsVariableIv, ivBytesFor } from "../domain/modes";
import { AES_KEY_SIZES, AES_MODES } from "../types";
import {
    aesKeySizeSchema,
    aesOptionsSchema,
    aesSearchParamsSchema,
} from "../validation/aes-options";
import { options } from "./factory";

describe("aesKeySizeSchema", () => {
    test("accepts every size the catalogue offers", () => {
        for (const size of AES_KEY_SIZES) {
            expect(aesKeySizeSchema.safeParse(size).success).toBe(true);
        }
    });

    test("rejects a width AES does not define", () => {
        expect(aesKeySizeSchema.safeParse(512).success).toBe(false);
        expect(aesKeySizeSchema.safeParse(64).success).toBe(false);
    });
});

describe("aesOptionsSchema", () => {
    for (const mode of AES_MODES) {
        test(`accepts a ${mode} IV of the width the mode requires`, () => {
            expect(aesOptionsSchema.safeParse(options({ mode })).success).toBe(true);
        });

        test(`rejects a ${mode} IV the mode cannot take`, () => {
            // GCM's nonce is variable, so "one byte over" is legitimate there;
            // what it still refuses is a width past the ceiling.
            const tooWide = acceptsVariableIv(mode)
                ? MAX_GCM_NONCE_BYTES + 1
                : ivBytesFor(mode) + 1;
            const wrong = options({ mode, ivHex: "00".repeat(tooWide) });

            expect(aesOptionsSchema.safeParse(wrong).success).toBe(false);
        });
    }

    test("accepts the 16-byte GCM nonce other tools demand", () => {
        const wide = options({ mode: "gcm", ivHex: "00".repeat(16) });

        expect(aesOptionsSchema.safeParse(wide).success).toBe(true);
    });

    test("tolerates whitespace inside the IV", () => {
        const spaced = options({ mode: "gcm", ivHex: "00 ".repeat(12).trim() });

        expect(aesOptionsSchema.safeParse(spaced).success).toBe(true);
    });

    test("rejects an iteration count outside the range", () => {
        expect(
            aesOptionsSchema.safeParse(options({ iterations: MIN_PBKDF2_ITERATIONS - 1 })).success,
        ).toBe(false);
        expect(
            aesOptionsSchema.safeParse(options({ iterations: MAX_PBKDF2_ITERATIONS + 1 })).success,
        ).toBe(false);
    });
});

describe("aesSearchParamsSchema", () => {
    test("reads a well-formed link", () => {
        const parsed = aesSearchParamsSchema.parse({
            direction: "decrypt",
            mode: "cbc",
            keySize: "256",
            cipherEncoding: "hex",
        });

        expect(parsed).toEqual({
            direction: "decrypt",
            mode: "cbc",
            keySize: 256,
            keySource: undefined,
            iterations: undefined,
            textEncoding: undefined,
            cipherEncoding: "hex",
        });
    });

    test("degrades one malformed field without losing the others", () => {
        const parsed = aesSearchParamsSchema.parse({ mode: "ecb", keySize: "256" });

        expect(parsed.mode).toBeUndefined();
        expect(parsed.keySize).toBe(256);
    });

    test("coerces an iteration count out of the string a URL carries", () => {
        expect(
            aesSearchParamsSchema.parse({ iterations: String(DEFAULT_PBKDF2_ITERATIONS) }),
        ).toMatchObject({ iterations: DEFAULT_PBKDF2_ITERATIONS });
    });

    /**
     * The rule this schema exists to keep. A passphrase, a key, a salt, an IV
     * or a payload in a URL ends up in browser history, in access logs, and in
     * the referrer of every outbound link on the page.
     */
    test("carries nothing secret and nothing substantive", () => {
        const parsed = aesSearchParamsSchema.parse({
            secret: "hunter2",
            input: "attack at dawn",
            saltHex: "00".repeat(16),
            ivHex: "00".repeat(12),
        });

        expect(Object.values(parsed).every((value) => value === undefined)).toBe(true);
    });
});
