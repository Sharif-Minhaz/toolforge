import { describe, expect, test } from "bun:test";

import { MAX_GCM_NONCE_BYTES } from "../domain/constants";
import { runAes } from "../domain/crypt";
import {
    acceptsVariableIv,
    isIvLengthSupported,
    ivBytesFor,
    maxIvBytesFor,
    readIvBytes,
} from "../domain/modes";
import { redrawIvHex } from "../domain/params";
import { AES_MODES } from "../types";
import { request } from "./factory";

/**
 * GCM's nonce may be any width. Twelve bytes is used directly; anything else is
 * run through GHASH first, which is a different construction producing a
 * different keystream. Both are legal, so a tool that fixed the width at twelve
 * could not read what a system using sixteen had written — which is exactly the
 * interop failure this exists to fix.
 *
 * The two vectors below were computed with `crypto.createCipheriv` (OpenSSL)
 * over the standard GCM test-case plaintext, then pinned.
 */

const GCM_KEY = "feffe9928665731c6d6a8f9467308308";

const GCM_PLAINTEXT =
    "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72" +
    "1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39";

const WIDE_NONCE_CASES = [
    {
        name: "a 16-byte nonce, the width other tools commonly demand",
        iv: "cafebabefacedbaddecaf888ceb1f4f2",
        expected:
            "884f94afa6d949dee8db337d2e3dd7ef9404867b0c08978679531193121f1086" +
            "b1efe624daef4ccea6bbb904107e06b79a638ed94ab2276e36ad17b0" +
            "8e72d30f88e978a423b4ae31734c3530",
    },
    {
        name: "an 8-byte nonce, where runtimes disagree",
        iv: "cafebabefacedbad",
        expected:
            "61353b4c2806934a777ff51fa22a4755699b2a714fcdc6f83766e5f97b6c7423" +
            "73806900e49f24b22b097544d4896b424989b5e1ebac0f07c23f4598" +
            "a1ce3697b50bc30ed84aa356f34b4a09",
    },
] as const;

describe("which modes take a variable IV", () => {
    test("is GCM alone", () => {
        expect(AES_MODES.filter(acceptsVariableIv)).toEqual(["gcm"]);
    });

    /** For CBC and CTR the IV is a block, so the width is arithmetic. */
    test("holds CBC and CTR to exactly one block", () => {
        for (const mode of ["cbc", "ctr"] as const) {
            expect(readIvBytes(mode, "00".repeat(16))).not.toBeNull();
            expect(readIvBytes(mode, "00".repeat(12))).toBeNull();
            expect(readIvBytes(mode, "00".repeat(17))).toBeNull();
            expect(maxIvBytesFor(mode)).toBe(16);
        }
    });

    test("lets GCM take any width up to the ceiling", () => {
        for (const bytes of [1, 8, 12, 13, 16, 32, MAX_GCM_NONCE_BYTES]) {
            expect(readIvBytes("gcm", "00".repeat(bytes))).not.toBeNull();
        }

        expect(readIvBytes("gcm", "")).toBeNull();
        expect(readIvBytes("gcm", "00".repeat(MAX_GCM_NONCE_BYTES + 1))).toBeNull();
        expect(maxIvBytesFor("gcm")).toBe(MAX_GCM_NONCE_BYTES);
    });

    test("still draws the recommended width", () => {
        expect(ivBytesFor("gcm")).toBe(12);
    });
});

describe("isIvLengthSupported", () => {
    test("never questions a fixed-width mode", async () => {
        expect(await isIvLengthSupported("cbc", 16)).toBe(true);
        expect(await isIvLengthSupported("ctr", 16)).toBe(true);
    });

    test("never questions the width GCM draws", async () => {
        expect(await isIvLengthSupported("gcm", 12)).toBe(true);
    });

    /** Sixteen is accepted everywhere, which is what makes the fix worth having. */
    test("accepts the 16-byte nonce on every runtime", async () => {
        expect(await isIvLengthSupported("gcm", 16)).toBe(true);
    });

    test("gives the same answer twice, since it is cached", async () => {
        const first = await isIvLengthSupported("gcm", 8);
        const second = await isIvLengthSupported("gcm", 8);

        expect(first).toBe(second);
    });
});

describe("GCM at a non-standard nonce width", () => {
    for (const testCase of WIDE_NONCE_CASES) {
        test(`matches OpenSSL for ${testCase.name}`, async () => {
            const bytes = testCase.iv.length / 2;
            const result = await runAes(
                request({
                    input: GCM_PLAINTEXT,
                    secret: GCM_KEY,
                    options: {
                        mode: "gcm",
                        keySize: 128,
                        keySource: "hex",
                        ivHex: testCase.iv,
                        textEncoding: "hex",
                        cipherEncoding: "hex",
                    },
                }),
            );

            // Node refuses a nonce under twelve bytes and Bun accepts one, so
            // the assertion states the real bytes where the width is available
            // and the documented refusal where it is not.
            if (!(await isIvLengthSupported("gcm", bytes))) {
                expect(result).toEqual({
                    ok: false,
                    reason: "unsupported_iv_length",
                    actualBytes: bytes,
                });

                return;
            }

            expect(result.ok && result.output).toBe(testCase.expected);
        });
    }

    test("reads back what it wrote under a 16-byte nonce", async () => {
        const iv = "0f".repeat(16);
        const encrypted = await runAes(
            request({ input: "attack at dawn", options: { mode: "gcm", ivHex: iv } }),
        );

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const decrypted = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                options: { mode: "gcm", ivHex: iv },
            }),
        );

        expect(decrypted).toMatchObject({ ok: true, output: "attack at dawn" });
    });

    /**
     * The whole reason the width has to be settable rather than assumed: twelve
     * and sixteen are different constructions, not the same one padded.
     */
    test("gives different bytes at 12 and 16, so the width is not cosmetic", async () => {
        const twelve = await runAes(
            request({ input: "abc", options: { mode: "gcm", ivHex: "0f".repeat(12) } }),
        );
        const sixteen = await runAes(
            request({ input: "abc", options: { mode: "gcm", ivHex: "0f".repeat(16) } }),
        );

        expect(twelve.ok && sixteen.ok && twelve.output).not.toBe(sixteen.ok ? sixteen.output : "");
    });

    /**
     * The button has to keep the width, not the mode's default. Redrawing a
     * sixteen-byte nonce as twelve would quietly undo a choice the reader made
     * on purpose, and the next ciphertext would be unreadable by the system
     * they set it for — with nothing on screen having changed.
     */
    test("redraws at the width already in the field", () => {
        expect(redrawIvHex("gcm", "0f".repeat(16))).toHaveLength(32);
        expect(redrawIvHex("gcm", "0f".repeat(12))).toHaveLength(24);
        expect(redrawIvHex("gcm", "0f".repeat(8))).toHaveLength(16);
    });

    test("falls back to the mode's width when the field cannot be read", () => {
        expect(redrawIvHex("gcm", "not hex")).toHaveLength(ivBytesFor("gcm") * 2);
        expect(redrawIvHex("cbc", "")).toHaveLength(ivBytesFor("cbc") * 2);
    });

    test("never carries a GCM width into a fixed-width mode", () => {
        expect(redrawIvHex("cbc", "0f".repeat(12))).toHaveLength(32);
        expect(redrawIvHex("ctr", "0f".repeat(12))).toHaveLength(32);
    });

    test("refuses a nonce past the ceiling by name", async () => {
        const result = await runAes(
            request({
                options: { mode: "gcm", ivHex: "00".repeat(MAX_GCM_NONCE_BYTES + 1) },
            }),
        );

        expect(result).toMatchObject({ ok: false, reason: "invalid_iv" });
    });
});
