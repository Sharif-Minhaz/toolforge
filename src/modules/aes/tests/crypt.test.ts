import { describe, expect, test } from "bun:test";

import { DEFAULT_GCM_TAG_LENGTH, MAX_AES_INPUT_LENGTH } from "../domain/constants";
import { tagBytesFor } from "../domain/modes";
import { runAes } from "../domain/crypt";
import { ivBytesFor } from "../domain/modes";
import { AES_MODES, type AesMode } from "../types";

/** The tag at the default width, which is what these cases encrypt with. */
const DEFAULT_TAG_BYTES = tagBytesFor("gcm", DEFAULT_GCM_TAG_LENGTH);
import { request } from "./factory";

/** A ciphertext produced by this tool, fed straight back into the other direction. */
async function roundTrip(mode: AesMode, plaintext: string, secret = "hunter2") {
    const encrypted = await runAes(
        request({
            input: plaintext,
            secret,
            options: { mode, ivHex: "0f".repeat(ivBytesFor(mode)) },
        }),
    );

    expect(encrypted.ok).toBe(true);

    if (!encrypted.ok) {
        return null;
    }

    return runAes(
        request({
            direction: "decrypt",
            input: encrypted.output,
            secret,
            options: { mode, ivHex: "0f".repeat(ivBytesFor(mode)) },
        }),
    );
}

describe("round trips", () => {
    for (const mode of AES_MODES) {
        test(`${mode} reads back what it wrote`, async () => {
            const result = await roundTrip(mode, "the quick brown fox");

            expect(result).toMatchObject({ ok: true, output: "the quick brown fox" });
        });

        test(`${mode} survives text outside ASCII`, async () => {
            const result = await roundTrip(mode, "টুলফোর্জ — 日本語 — 🔐");

            expect(result).toMatchObject({ ok: true, output: "টুলফোর্জ — 日本語 — 🔐" });
        });
    }

    test("reports byte counts for both sides", async () => {
        const encrypted = await runAes(request({ input: "abc", options: { mode: "gcm" } }));

        // GCM adds the tag and nothing else — no padding, no length rounding.
        expect(encrypted).toMatchObject({
            ok: true,
            inputBytes: 3,
            outputBytes: 3 + DEFAULT_TAG_BYTES,
        });
    });

    test("pads CBC out to whole blocks", async () => {
        const encrypted = await runAes(request({ input: "abc", options: { mode: "cbc" } }));

        expect(encrypted).toMatchObject({ ok: true, inputBytes: 3, outputBytes: 16 });
    });
});

describe("refusals about the payload", () => {
    test("names an empty box rather than encrypting nothing", async () => {
        expect(await runAes(request({ input: "" }))).toEqual({ ok: false, reason: "empty_input" });
    });

    test("refuses a payload past the ceiling", async () => {
        const result = await runAes(request({ input: "a".repeat(MAX_AES_INPUT_LENGTH + 1) }));

        expect(result).toEqual({ ok: false, reason: "too_large" });
    });

    test("accepts a payload exactly at the ceiling", async () => {
        const result = await runAes(request({ input: "a".repeat(MAX_AES_INPUT_LENGTH) }));

        expect(result.ok).toBe(true);
    });

    test("refuses plaintext that is not the encoding it was told", async () => {
        const result = await runAes(request({ input: "zzz", options: { textEncoding: "hex" } }));

        expect(result).toEqual({ ok: false, reason: "invalid_input_encoding" });
    });

    test("refuses ciphertext that is not the encoding it was told", async () => {
        const result = await runAes(
            request({
                direction: "decrypt",
                input: "not hex at all",
                options: { cipherEncoding: "hex" },
            }),
        );

        expect(result).toEqual({ ok: false, reason: "invalid_input_encoding" });
    });

    test("names a CBC ciphertext that is not a whole number of blocks", async () => {
        const result = await runAes(
            request({
                direction: "decrypt",
                input: "00".repeat(17),
                options: { mode: "cbc", cipherEncoding: "hex" },
            }),
        );

        expect(result).toEqual({ ok: false, reason: "unaligned_ciphertext", actualBytes: 17 });
    });

    test("names a GCM ciphertext too short to hold a tag", async () => {
        const result = await runAes(
            request({
                direction: "decrypt",
                input: "00".repeat(DEFAULT_TAG_BYTES - 1),
                options: { mode: "gcm", cipherEncoding: "hex" },
            }),
        );

        expect(result).toEqual({
            ok: false,
            reason: "ciphertext_too_short",
            actualBytes: DEFAULT_TAG_BYTES - 1,
            expectedBytes: DEFAULT_TAG_BYTES,
        });
    });
});

describe("refusals about the initialisation vector", () => {
    for (const mode of AES_MODES) {
        test(`${mode} states the width it needs`, async () => {
            const result = await runAes(
                request({ options: { mode, ivHex: "00".repeat(ivBytesFor(mode) + 1) } }),
            );

            expect(result).toEqual({
                ok: false,
                reason: "invalid_iv",
                expectedBytes: ivBytesFor(mode),
            });
        });
    }

    test("refuses an IV that is not hex at all", async () => {
        const result = await runAes(request({ options: { ivHex: "not-hex" } }));

        expect(result).toEqual({ ok: false, reason: "invalid_iv", expectedBytes: 12 });
    });

    test("reads an IV pasted with whitespace in it", async () => {
        const spaced = "0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f";
        const result = await runAes(request({ options: { mode: "gcm", ivHex: spaced } }));

        expect(result.ok).toBe(true);
    });
});

describe("what an authenticated mode notices", () => {
    /** Flips the last bit of a hex string, which is one bit of the GCM tag. */
    function tamper(hex: string): string {
        const last = Number.parseInt(hex.slice(-1), 16) ^ 1;

        return hex.slice(0, -1) + last.toString(16);
    }

    test("GCM refuses a ciphertext that was altered", async () => {
        const encrypted = await runAes(
            request({ input: "transfer 100", options: { mode: "gcm", cipherEncoding: "hex" } }),
        );

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const result = await runAes(
            request({
                direction: "decrypt",
                input: tamper(encrypted.output),
                options: { mode: "gcm", cipherEncoding: "hex" },
            }),
        );

        expect(result).toEqual({ ok: false, reason: "authentication_failed" });
    });

    test("GCM refuses the wrong key by the same route", async () => {
        const encrypted = await runAes(request({ input: "secret", secret: "right" }));

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const result = await runAes(
            request({ direction: "decrypt", input: encrypted.output, secret: "wrong" }),
        );

        expect(result).toEqual({ ok: false, reason: "authentication_failed" });
    });

    /**
     * The defect an unauthenticated mode cannot report. CTR is a keystream, so
     * a wrong key yields bytes rather than an error — and the only thing that
     * ever complains is the UTF-8 reader downstream. This is asserted rather
     * than merely documented because it is the reason GCM is the default.
     */
    test("CTR cannot tell a wrong key from a right one", async () => {
        const encrypted = await runAes(
            request({ input: "secret", secret: "right", options: { mode: "ctr" } }),
        );

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const result = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                secret: "wrong",
                options: { mode: "ctr", textEncoding: "hex" },
            }),
        );

        // Hex can render any bytes at all, so the wrong key produces a
        // confident, entirely wrong answer.
        expect(result.ok).toBe(true);
        expect(result.ok && result.output).not.toBe("736563726574");
    });

    test("CBC reports a padding it could not read", async () => {
        const encrypted = await runAes(
            request({ input: "secret", secret: "right", options: { mode: "cbc" } }),
        );

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const result = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                secret: "wrong",
                options: { mode: "cbc" },
            }),
        );

        // A wrong key leaves the final block as noise, which is a valid PKCS#7
        // trailer about once in every 256 attempts — so both outcomes are
        // legitimate, and neither is `authentication_failed`.
        expect(result.ok ? "decoded" : result.reason).not.toBe("authentication_failed");
    });
});

describe("decrypting to bytes that are not text", () => {
    test("names UTF-8 as the thing that failed, not the cipher", async () => {
        const secret = "0f".repeat(32);
        const encrypted = await runAes(
            request({
                input: "ff",
                secret,
                options: { keySource: "hex", textEncoding: "hex", mode: "ctr" },
            }),
        );

        expect(encrypted.ok).toBe(true);

        if (!encrypted.ok) {
            return;
        }

        const result = await runAes(
            request({
                direction: "decrypt",
                input: encrypted.output,
                secret,
                options: { keySource: "hex", textEncoding: "utf-8", mode: "ctr" },
            }),
        );

        expect(result).toEqual({ ok: false, reason: "undecodable_text" });
    });
});

describe("the injected key resolver", () => {
    test("is what decides the key, so a caller can memoise it", async () => {
        const bytes = new Uint8Array(32).fill(7);
        let calls = 0;

        const resolve = async () => {
            calls += 1;

            return { ok: true as const, bytes };
        };

        const first = await runAes(request({ input: "one" }), resolve);
        const second = await runAes(request({ input: "two" }), resolve);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(calls).toBe(2);
    });

    test("passes its refusal straight through", async () => {
        const resolve = async () => ({ ok: false as const, reason: "empty_key" as const });

        expect(await runAes(request(), resolve)).toEqual({ ok: false, reason: "empty_key" });
    });
});
