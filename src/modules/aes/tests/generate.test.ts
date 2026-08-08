import { describe, expect, test } from "bun:test";

import { base64ToBytes } from "@/modules/tools/domain/base64";
import { hexToBytes } from "@/modules/tools/domain/hex";
import type { RandomBytes } from "@/modules/tools/types";
import {
    generateKeyMaterial,
    generatePassphrase,
    passphraseLengthFor,
    PASSPHRASE_ALPHABET,
} from "../domain/generate";
import { resolveAesKey } from "../domain/key";
import { AES_KEY_SIZES, AES_KEY_SOURCES } from "../types";

/** A source that counts up, so every drawn byte is predictable. */
const counting: RandomBytes = (length) => Uint8Array.from({ length }, (_, index) => index);

describe("passphraseLengthFor", () => {
    /**
     * The point of the rule, stated as a test: a generated passphrase is never
     * the weaker half of the pair it forms with the key it derives.
     */
    test("carries at least as many bits as the key it will derive", () => {
        const bitsPerCharacter = Math.log2(PASSPHRASE_ALPHABET.length);

        for (const keySize of AES_KEY_SIZES) {
            expect(passphraseLengthFor(keySize) * bitsPerCharacter).toBeGreaterThanOrEqual(keySize);
        }
    });

    test("is the shortest length that does so", () => {
        const bitsPerCharacter = Math.log2(PASSPHRASE_ALPHABET.length);

        for (const keySize of AES_KEY_SIZES) {
            expect((passphraseLengthFor(keySize) - 1) * bitsPerCharacter).toBeLessThan(keySize);
        }
    });

    test("grows with the key size", () => {
        expect(passphraseLengthFor(128)).toBeLessThan(passphraseLengthFor(192));
        expect(passphraseLengthFor(192)).toBeLessThan(passphraseLengthFor(256));
    });
});

describe("generatePassphrase", () => {
    test("draws only from the documented alphabet", () => {
        for (const character of generatePassphrase(256)) {
            expect(PASSPHRASE_ALPHABET).toContain(character);
        }
    });

    test("is exactly as long as the rule says", () => {
        for (const keySize of AES_KEY_SIZES) {
            expect(generatePassphrase(keySize)).toHaveLength(passphraseLengthFor(keySize));
        }
    });

    /** No escaping hazards: this lands in shells, URLs and config files. */
    test("never draws a character that would need quoting", () => {
        expect(/^[A-Za-z0-9\-._~]+$/.test(generatePassphrase(256))).toBe(true);
    });

    test("is pinned by its injected source", () => {
        expect(generatePassphrase(128, counting)).toBe(generatePassphrase(128, counting));
    });
});

describe("generateKeyMaterial", () => {
    test("writes hex of exactly the key width", () => {
        for (const keySize of AES_KEY_SIZES) {
            const key = generateKeyMaterial("hex", keySize);

            expect(key).toHaveLength(keySize / 4);
            expect(hexToBytes(key)?.length).toBe(keySize / 8);
        }
    });

    test("writes base64 of exactly the key width", () => {
        for (const keySize of AES_KEY_SIZES) {
            const key = generateKeyMaterial("base64", keySize);

            expect(base64ToBytes(key)?.length).toBe(keySize / 8);
        }
    });

    test("draws fresh material every time", () => {
        const drawn = new Set(Array.from({ length: 8 }, () => generateKeyMaterial("hex", 256)));

        expect(drawn.size).toBe(8);
    });

    /**
     * The property that actually matters, and the reason this lives beside the
     * key reader rather than in the component: whatever the button produces,
     * the field it produces it for must accept.
     */
    for (const source of AES_KEY_SOURCES) {
        for (const keySize of AES_KEY_SIZES) {
            test(`a generated ${source} is accepted as a ${keySize}-bit key`, async () => {
                const key = await resolveAesKey({
                    source,
                    secret: generateKeyMaterial(source, keySize),
                    saltHex: "18446f781c8f697caef3609ac74783f7",
                    iterations: 1_000,
                    keySize,
                });

                expect(key.ok && key.bytes.length).toBe(keySize / 8);
            });
        }
    }
});
