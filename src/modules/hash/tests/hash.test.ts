import { describe, expect, test } from "bun:test";

import { detectHash } from "@/modules/hash/domain/detect";
import { digestText } from "@/modules/hash/domain/digest";
import {
    BCRYPT_MAX_PASSWORD_BYTES,
    DEFAULT_HASH_OPTIONS,
    MAX_ARGON2_MEMORY,
    MAX_BCRYPT_COST,
    MAX_HASH_INPUT_LENGTH,
    MIN_BCRYPT_COST,
} from "@/modules/hash/domain/constants";
import { hashText } from "@/modules/hash/domain/hash";
import { verifyArgon2, verifyBcrypt } from "@/modules/hash/domain/password";
import { createSaltSeed } from "@/modules/hash/domain/salt";
import type { HashOptions } from "@/modules/hash/types";

/** A fixed seed, so a salted hash is reproducible and can be asserted on. */
const SEED = createSaltSeed((into) => into.fill(7));

const OTHER_SEED = createSaltSeed((into) => into.fill(9));

function options(patch: Partial<HashOptions> = {}): HashOptions {
    return { ...DEFAULT_HASH_OPTIONS, ...patch };
}

/** Cheap enough to run in a test, still exercising the real KDF. */
const FAST_ARGON2: Partial<HashOptions> = {
    argon2Memory: 512,
    argon2Iterations: 1,
    argon2Parallelism: 1,
    argon2HashLength: 32,
};

describe("hashText on digests", () => {
    test("returns the digest and reports the family", async () => {
        const result = await hashText({ text: "abc", options: options(), saltSeed: SEED });

        expect(result).toEqual({
            ok: true,
            algorithm: "sha256",
            family: "digest",
            hash: await digestText("abc", "sha256", "hex"),
        });
    });

    test("ignores the salt seed entirely", async () => {
        const first = await hashText({ text: "abc", options: options(), saltSeed: SEED });
        const second = await hashText({ text: "abc", options: options(), saltSeed: OTHER_SEED });

        expect(first).toEqual(second);
    });

    test("rejects empty input as empty_input, not as an empty password", async () => {
        expect(await hashText({ text: "", options: options(), saltSeed: SEED })).toEqual({
            ok: false,
            reason: "empty_input",
        });
    });

    test("accepts input exactly at the ceiling", async () => {
        const result = await hashText({
            text: "a".repeat(MAX_HASH_INPUT_LENGTH),
            options: options(),
            saltSeed: SEED,
        });

        expect(result.ok).toBe(true);
    });

    test("rejects one character past the ceiling", async () => {
        expect(
            await hashText({
                text: "a".repeat(MAX_HASH_INPUT_LENGTH + 1),
                options: options(),
                saltSeed: SEED,
            }),
        ).toEqual({ ok: false, reason: "too_large" });
    });
});

describe("hashText on bcrypt", () => {
    test("produces a hash its own verifier accepts", async () => {
        const result = await hashText({
            text: "correct horse battery staple",
            options: options({ algorithm: "bcrypt", bcryptCost: MIN_BCRYPT_COST }),
            saltSeed: SEED,
        });

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(await verifyBcrypt("correct horse battery staple", result.hash)).toBe(true);
            expect(await verifyBcrypt("wrong password", result.hash)).toBe(false);
        }
    });

    test("writes the requested cost into the hash", async () => {
        const result = await hashText({
            text: "hunter2",
            options: options({ algorithm: "bcrypt", bcryptCost: 5 }),
            saltSeed: SEED,
        });

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(detectHash(result.hash)).toMatchObject({ family: "bcrypt", cost: 5 });
        }
    });

    test("is deterministic for one seed and differs across seeds", async () => {
        const request = {
            text: "hunter2",
            options: options({ algorithm: "bcrypt", bcryptCost: MIN_BCRYPT_COST }),
        };
        const first = await hashText({ ...request, saltSeed: SEED });
        const repeat = await hashText({ ...request, saltSeed: SEED });
        const other = await hashText({ ...request, saltSeed: OTHER_SEED });

        expect(first).toEqual(repeat);
        expect(first).not.toEqual(other);
    });

    test("accepts a password of exactly 72 bytes", async () => {
        const result = await hashText({
            text: "a".repeat(BCRYPT_MAX_PASSWORD_BYTES),
            options: options({ algorithm: "bcrypt", bcryptCost: MIN_BCRYPT_COST }),
            saltSeed: SEED,
        });

        expect(result.ok).toBe(true);
    });

    test("refuses 73 bytes rather than truncating", async () => {
        expect(
            await hashText({
                text: "a".repeat(BCRYPT_MAX_PASSWORD_BYTES + 1),
                options: options({ algorithm: "bcrypt", bcryptCost: MIN_BCRYPT_COST }),
                saltSeed: SEED,
            }),
        ).toEqual({ ok: false, reason: "password_too_long", bytes: 73 });
    });

    test("counts bytes, not characters, against the 72-byte rule", async () => {
        // 24 four-byte emoji are 96 bytes but only 48 UTF-16 code units.
        const result = await hashText({
            text: "🔐".repeat(24),
            options: options({ algorithm: "bcrypt", bcryptCost: MIN_BCRYPT_COST }),
            saltSeed: SEED,
        });

        expect(result).toEqual({ ok: false, reason: "password_too_long", bytes: 96 });
    });

    test("reports an empty password as empty_password", async () => {
        expect(
            await hashText({
                text: "",
                options: options({ algorithm: "bcrypt" }),
                saltSeed: SEED,
            }),
        ).toEqual({ ok: false, reason: "empty_password" });
    });

    for (const cost of [MIN_BCRYPT_COST - 1, MAX_BCRYPT_COST + 1, 10.5, Number.NaN]) {
        test(`rejects a cost of ${cost}`, async () => {
            expect(
                await hashText({
                    text: "hunter2",
                    options: options({ algorithm: "bcrypt", bcryptCost: cost }),
                    saltSeed: SEED,
                }),
            ).toEqual({ ok: false, reason: "invalid_cost" });
        });
    }
});

describe("hashText on argon2", () => {
    for (const variant of ["argon2id", "argon2i", "argon2d"] as const) {
        test(`${variant} produces a hash its own verifier accepts`, async () => {
            const result = await hashText({
                text: "hunter2",
                options: options({ algorithm: variant, ...FAST_ARGON2 }),
                saltSeed: SEED,
            });

            expect(result.ok).toBe(true);

            if (result.ok) {
                expect(detectHash(result.hash)).toMatchObject({ family: "argon2", variant });
                expect(await verifyArgon2("hunter2", result.hash)).toBe(true);
                expect(await verifyArgon2("hunter3", result.hash)).toBe(false);
            }
        });
    }

    test("writes the requested parameters into the hash", async () => {
        const result = await hashText({
            text: "hunter2",
            options: options({
                algorithm: "argon2id",
                argon2Memory: 1_024,
                argon2Iterations: 3,
                argon2Parallelism: 2,
                argon2HashLength: 16,
            }),
            saltSeed: SEED,
        });

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(detectHash(result.hash)).toEqual({
                family: "argon2",
                variant: "argon2id",
                version: 19,
                memory: 1_024,
                iterations: 3,
                parallelism: 2,
            });
        }
    });

    test("is deterministic for one seed and differs across seeds", async () => {
        const request = {
            text: "hunter2",
            options: options({ algorithm: "argon2id", ...FAST_ARGON2 }),
        };

        expect(await hashText({ ...request, saltSeed: SEED })).toEqual(
            await hashText({ ...request, saltSeed: SEED }),
        );
        expect(await hashText({ ...request, saltSeed: SEED })).not.toEqual(
            await hashText({ ...request, saltSeed: OTHER_SEED }),
        );
    });

    for (const [label, patch] of [
        ["memory below the floor", { argon2Memory: 4 }],
        ["memory above the ceiling", { argon2Memory: MAX_ARGON2_MEMORY + 1 }],
        ["memory below 8 × parallelism", { argon2Memory: 8, argon2Parallelism: 4 }],
        ["zero iterations", { argon2Iterations: 0 }],
        ["zero parallelism", { argon2Parallelism: 0 }],
        ["a hash length below 4", { argon2HashLength: 3 }],
        ["a fractional memory cost", { argon2Memory: 1_024.5 }],
        ["a NaN iteration count", { argon2Iterations: Number.NaN }],
    ] as const) {
        test(`rejects ${label}`, async () => {
            expect(
                await hashText({
                    text: "hunter2",
                    options: options({ algorithm: "argon2id", ...FAST_ARGON2, ...patch }),
                    saltSeed: SEED,
                }),
            ).toEqual({ ok: false, reason: "invalid_argon2_parameters" });
        });
    }

    test("accepts memory exactly at 8 × parallelism", async () => {
        const result = await hashText({
            text: "hunter2",
            options: options({
                algorithm: "argon2id",
                ...FAST_ARGON2,
                argon2Parallelism: 2,
                argon2Memory: 16,
            }),
            saltSeed: SEED,
        });

        expect(result.ok).toBe(true);
    });
});

describe("hashText failure handling", () => {
    test("reports a malformed salt seed as hashing_failed rather than throwing", async () => {
        const result = await hashText({
            text: "hunter2",
            options: options({ algorithm: "bcrypt", bcryptCost: MIN_BCRYPT_COST }),
            saltSeed: "not base64 at all!!",
        });

        expect(result).toEqual({ ok: false, reason: "hashing_failed" });
    });
});
