import { describe, expect, test } from "bun:test";

import { compareHash } from "@/modules/hash/domain/compare";
import { DEFAULT_HASH_OPTIONS, MAX_HASH_INPUT_LENGTH } from "@/modules/hash/domain/constants";
import { digestText } from "@/modules/hash/domain/digest";
import { hashText } from "@/modules/hash/domain/hash";
import { createSaltSeed } from "@/modules/hash/domain/salt";
import { DIGEST_ALGORITHMS, DIGEST_ENCODINGS } from "@/modules/hash/types";

const SEED = createSaltSeed((into) => into.fill(7));

/** jBCrypt published vector: bcrypt("abc") at cost 6. */
const BCRYPT_ABC = "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i";

/** argon2 reference CLI: `echo -n password | argon2 somesalt -t 2 -m 16 -p 4 -l 24`. */
const ARGON2I_PASSWORD =
    "$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

describe("compareHash against a bcrypt hash", () => {
    test("verifies the matching password", async () => {
        expect(await compareHash({ left: "abc", right: BCRYPT_ABC })).toEqual({
            ok: true,
            kind: "verify",
            detected: { family: "bcrypt", prefix: "$2a$", cost: 6 },
            match: true,
        });
    });

    test("rejects the wrong password", async () => {
        const result = await compareHash({ left: "abd", right: BCRYPT_ABC });

        expect(result).toMatchObject({ ok: true, kind: "verify", match: false });
    });

    test("takes the parameters from the hash, not from any setting", async () => {
        const result = await compareHash({ left: "abc", right: BCRYPT_ABC });

        expect(result).toMatchObject({ detected: { cost: 6 } });
        expect(DEFAULT_HASH_OPTIONS.bcryptCost).not.toBe(6);
    });

    test("does not trim the password, because whitespace is part of it", async () => {
        const result = await compareHash({ left: " abc", right: BCRYPT_ABC });

        expect(result).toMatchObject({ match: false });
    });

    test("refuses a password past bcrypt's 72-byte ceiling", async () => {
        expect(await compareHash({ left: "a".repeat(73), right: BCRYPT_ABC })).toEqual({
            ok: false,
            reason: "password_too_long",
        });
    });

    test("round-trips a hash this tool minted", async () => {
        const generated = await hashText({
            text: "correct horse battery staple",
            options: { ...DEFAULT_HASH_OPTIONS, algorithm: "bcrypt", bcryptCost: 4 },
            saltSeed: SEED,
        });

        expect(generated.ok).toBe(true);

        if (generated.ok) {
            expect(
                await compareHash({
                    left: "correct horse battery staple",
                    right: generated.hash,
                }),
            ).toMatchObject({ kind: "verify", match: true });
        }
    });
});

describe("compareHash against an argon2 hash", () => {
    test("verifies the matching password", async () => {
        expect(await compareHash({ left: "password", right: ARGON2I_PASSWORD })).toEqual({
            ok: true,
            kind: "verify",
            detected: {
                family: "argon2",
                variant: "argon2i",
                version: 19,
                memory: 65_536,
                iterations: 2,
                parallelism: 4,
            },
            match: true,
        });
    });

    test("rejects the wrong password", async () => {
        expect(await compareHash({ left: "Password", right: ARGON2I_PASSWORD })).toMatchObject({
            kind: "verify",
            match: false,
        });
    });

    test("round-trips a hash this tool minted", async () => {
        const generated = await hashText({
            text: "hunter2",
            options: {
                ...DEFAULT_HASH_OPTIONS,
                algorithm: "argon2id",
                argon2Memory: 512,
                argon2Iterations: 1,
            },
            saltSeed: SEED,
        });

        expect(generated.ok).toBe(true);

        if (generated.ok) {
            expect(await compareHash({ left: "hunter2", right: generated.hash })).toMatchObject({
                kind: "verify",
                match: true,
            });
        }
    });
});

describe("compareHash between two digests", () => {
    for (const algorithm of DIGEST_ALGORITHMS) {
        for (const encoding of DIGEST_ENCODINGS) {
            test(`matches two identical ${algorithm} ${encoding} digests`, async () => {
                const hash = await digestText("abc", algorithm, encoding);

                expect(await compareHash({ left: hash, right: hash })).toEqual({
                    ok: true,
                    kind: "digest",
                    detected: { family: "digest", algorithm, encoding },
                    match: true,
                });
            });
        }
    }

    test("reports two different digests as a mismatch", async () => {
        const left = await digestText("abc", "sha256", "hex");
        const right = await digestText("abd", "sha256", "hex");

        expect(await compareHash({ left, right })).toMatchObject({ kind: "digest", match: false });
    });

    test("treats hex case as insignificant", async () => {
        const hash = await digestText("abc", "sha256", "hex");

        expect(await compareHash({ left: hash.toUpperCase(), right: hash })).toMatchObject({
            kind: "digest",
            match: true,
        });
    });

    test("ignores whitespace around a pasted checksum", async () => {
        const hash = await digestText("abc", "md5", "hex");

        expect(await compareHash({ left: `  ${hash}\n`, right: `\t${hash} ` })).toMatchObject({
            kind: "digest",
            match: true,
        });
    });

    test("does not treat differently-encoded digests of the same value as equal", async () => {
        // One is hex and one is base64, so the left is not a digest of the same
        // shape and gets hashed as text instead. That is a mismatch, correctly.
        const hex = await digestText("abc", "sha256", "hex");
        const base64 = await digestText("abc", "sha256", "base64");

        expect(await compareHash({ left: hex, right: base64 })).toMatchObject({
            kind: "verify",
            match: false,
        });
    });
});

describe("compareHash hashing plaintext against a digest", () => {
    for (const algorithm of DIGEST_ALGORITHMS) {
        test(`hashes the left side with the detected ${algorithm}`, async () => {
            const right = await digestText("correct horse battery staple", algorithm, "hex");

            expect(await compareHash({ left: "correct horse battery staple", right })).toEqual({
                ok: true,
                kind: "verify",
                detected: { family: "digest", algorithm, encoding: "hex" },
                match: true,
            });
        });
    }

    test("uses the encoding the right-hand digest was written in", async () => {
        const right = await digestText("abc", "sha256", "base64");

        expect(await compareHash({ left: "abc", right })).toMatchObject({
            kind: "verify",
            detected: { encoding: "base64" },
            match: true,
        });
    });

    test("reports a mismatch when the plaintext is wrong", async () => {
        const right = await digestText("abc", "md5", "hex");

        expect(await compareHash({ left: "abd", right })).toMatchObject({
            kind: "verify",
            match: false,
        });
    });

    test("does not trim the plaintext before hashing it", async () => {
        const right = await digestText(" abc", "sha256", "hex");

        expect(await compareHash({ left: " abc", right })).toMatchObject({ match: true });
    });
});

describe("compareHash failures", () => {
    test("reports an empty left box", async () => {
        expect(await compareHash({ left: "", right: BCRYPT_ABC })).toEqual({
            ok: false,
            reason: "empty_input",
        });
    });

    test("reports an empty right box", async () => {
        expect(await compareHash({ left: "abc", right: "   " })).toEqual({
            ok: false,
            reason: "empty_input",
        });
    });

    test("reports a right-hand value that is not a hash at all", async () => {
        expect(await compareHash({ left: "abc", right: "definitely not a hash" })).toEqual({
            ok: false,
            reason: "unrecognized_hash",
        });
    });

    test("reports a hex string of an unknown width as unrecognised", async () => {
        expect(await compareHash({ left: "abc", right: "a".repeat(48) })).toEqual({
            ok: false,
            reason: "unrecognized_hash",
        });
    });

    test("reports input past the ceiling", async () => {
        expect(
            await compareHash({
                left: "a".repeat(MAX_HASH_INPUT_LENGTH + 1),
                right: BCRYPT_ABC,
            }),
        ).toEqual({ ok: false, reason: "too_large" });
    });
});
