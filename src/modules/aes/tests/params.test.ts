import { describe, expect, test } from "bun:test";

import type { RandomBytes } from "@/modules/tools/types";
import { AES_SALT_BYTES } from "../domain/constants";
import { isAuthenticated, isBlockAligned, ivBytesFor, subtleParams } from "../domain/modes";
import { randomIvHex, randomSaltHex } from "../domain/params";
import { AES_MODES } from "../types";

/** A source that counts up, so every drawn byte is predictable. */
const counting: RandomBytes = (length) => Uint8Array.from({ length }, (_, index) => index);

describe("randomSaltHex", () => {
    test("draws the documented width", () => {
        expect(randomSaltHex(counting)).toHaveLength(AES_SALT_BYTES * 2);
    });

    test("renders the bytes it was given", () => {
        expect(randomSaltHex(counting)).toBe("000102030405060708090a0b0c0d0e0f");
    });
});

describe("randomIvHex", () => {
    for (const mode of AES_MODES) {
        test(`draws ${ivBytesFor(mode)} bytes for ${mode}`, () => {
            expect(randomIvHex(mode, counting)).toHaveLength(ivBytesFor(mode) * 2);
        });
    }

    test("gives GCM a nonce and the block modes a block", () => {
        expect(ivBytesFor("gcm")).toBe(12);
        expect(ivBytesFor("cbc")).toBe(16);
        expect(ivBytesFor("ctr")).toBe(16);
    });
});

describe("mode properties", () => {
    test("names GCM as the only authenticated mode", () => {
        expect(AES_MODES.filter(isAuthenticated)).toEqual(["gcm"]);
    });

    test("names CBC as the only block-aligned mode", () => {
        expect(AES_MODES.filter(isBlockAligned)).toEqual(["cbc"]);
    });

    test("hands CTR a counter and the others an IV", () => {
        const iv = new Uint8Array(16);

        expect(subtleParams("ctr", iv, 128)).toEqual({ name: "AES-CTR", counter: iv, length: 64 });
        expect(subtleParams("cbc", iv, 128)).toEqual({ name: "AES-CBC", iv });
    });

    /** Stated rather than left to the engine's default, so the request is explicit. */
    test("names the tag width on every GCM request", () => {
        const nonce = new Uint8Array(12);

        expect(subtleParams("gcm", nonce, 128)).toEqual({
            name: "AES-GCM",
            iv: nonce,
            tagLength: 128,
        });
        expect(subtleParams("gcm", nonce, 96)).toEqual({
            name: "AES-GCM",
            iv: nonce,
            tagLength: 96,
        });
    });
});
