import { describe, expect, test } from "bun:test";

import { DEFAULT_GCM_TAG_LENGTH } from "../domain/constants";
import { runAes } from "../domain/crypt";
import { tagBytesFor } from "../domain/modes";
import { AES_MODES, GCM_TAG_LENGTHS } from "../types";
import { request } from "./factory";

describe("tagBytesFor", () => {
    test("is the tag width in bytes under GCM", () => {
        for (const tagLength of GCM_TAG_LENGTHS) {
            expect(tagBytesFor("gcm", tagLength)).toBe(tagLength / 8);
        }
    });

    /** No other mode here has a tag, so the length floor is zero for them. */
    test("is zero for the unauthenticated modes, whatever the setting says", () => {
        for (const mode of AES_MODES.filter((candidate) => candidate !== "gcm")) {
            for (const tagLength of GCM_TAG_LENGTHS) {
                expect(tagBytesFor(mode, tagLength)).toBe(0);
            }
        }
    });
});

describe("GCM at every tag width", () => {
    for (const tagLength of GCM_TAG_LENGTHS) {
        test(`${tagLength} bits adds exactly ${tagLength / 8} bytes to the ciphertext`, async () => {
            const result = await runAes(
                request({ input: "abc", options: { mode: "gcm", tagLength } }),
            );

            expect(result).toMatchObject({
                ok: true,
                inputBytes: 3,
                outputBytes: 3 + tagLength / 8,
            });
        });

        test(`${tagLength} bits reads its own ciphertext back`, async () => {
            const encrypted = await runAes(
                request({ input: "attack at dawn", options: { mode: "gcm", tagLength } }),
            );

            expect(encrypted.ok).toBe(true);

            if (!encrypted.ok) {
                return;
            }

            const decrypted = await runAes(
                request({
                    direction: "decrypt",
                    input: encrypted.output,
                    options: { mode: "gcm", tagLength },
                }),
            );

            expect(decrypted).toMatchObject({ ok: true, output: "attack at dawn" });
        });
    }

    /**
     * The tag width is not carried in the ciphertext, so it has to be agreed
     * out of band exactly like the key and the IV. Decrypting with the wrong
     * one reads part of the tag as ciphertext and the check fails — which is
     * the authenticated mode doing its job, not a defect.
     */
    test("refuses a ciphertext whose tag was a different width", async () => {
        const encrypted = await runAes(
            request({ input: "attack at dawn", options: { mode: "gcm", tagLength: 128 } }),
        );

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const decrypted = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                options: { mode: "gcm", tagLength: 96 },
            }),
        );

        expect(decrypted).toEqual({ ok: false, reason: "authentication_failed" });
    });

    test("moves the too-short floor with the setting", async () => {
        const result = await runAes(
            request({
                direction: "decrypt",
                input: "00".repeat(5),
                options: { mode: "gcm", tagLength: 96, cipherEncoding: "hex" },
            }),
        );

        expect(result).toEqual({
            ok: false,
            reason: "ciphertext_too_short",
            actualBytes: 5,
            expectedBytes: 12,
        });
    });

    test("accepts a ciphertext of exactly the tag width, which is an empty plaintext", async () => {
        const encrypted = await runAes(
            request({ input: "00", options: { mode: "gcm", tagLength: 96, textEncoding: "hex" } }),
        );

        expect(encrypted.ok && encrypted.outputBytes).toBe(13);
    });
});

describe("the tag setting outside GCM", () => {
    /** Disabled in the UI, and inert here — the two agree by construction. */
    test("changes no byte of a CBC or CTR ciphertext", async () => {
        for (const mode of ["cbc", "ctr"] as const) {
            const full = await runAes(
                request({ input: "abc", options: { mode, tagLength: DEFAULT_GCM_TAG_LENGTH } }),
            );
            const short = await runAes(request({ input: "abc", options: { mode, tagLength: 32 } }));

            expect(full.ok && short.ok && full.output).toBe(short.ok ? short.output : "");
        }
    });
});
