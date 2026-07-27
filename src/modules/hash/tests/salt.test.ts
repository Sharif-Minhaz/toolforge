import { describe, expect, test } from "bun:test";

import {
    ARGON2_SALT_BYTES,
    BCRYPT_SALT_BYTES,
    SALT_SEED_BYTES,
} from "@/modules/hash/domain/constants";
import { createSaltSeed, deriveSalt } from "@/modules/hash/domain/salt";

describe("createSaltSeed", () => {
    test("encodes the full pool as base64", () => {
        const seed = createSaltSeed((into) => into.fill(0));

        expect(Buffer.from(seed, "base64")).toHaveLength(SALT_SEED_BYTES);
    });

    test("asks the injected source for exactly the pool size", () => {
        let requested = -1;

        createSaltSeed((into) => {
            requested = into.length;

            return into;
        });

        expect(requested).toBe(SALT_SEED_BYTES);
    });

    test("two draws from real randomness differ", () => {
        expect(createSaltSeed()).not.toBe(createSaltSeed());
    });
});

describe("deriveSalt", () => {
    const seed = createSaltSeed((into) => into.map((_, index) => index));

    test("gives bcrypt exactly the 16 bytes it requires", () => {
        expect(deriveSalt(seed, "bcrypt")).toHaveLength(BCRYPT_SALT_BYTES);
    });

    test("gives argon2 its full width", () => {
        for (const variant of ["argon2id", "argon2i", "argon2d"] as const) {
            expect(deriveSalt(seed, variant)).toHaveLength(ARGON2_SALT_BYTES);
        }
    });

    test("hands the digests nothing, because they take no salt", () => {
        for (const algorithm of ["md5", "sha1", "sha256", "sha512"] as const) {
            expect(deriveSalt(seed, algorithm)).toHaveLength(0);
        }
    });

    test("is deterministic for one seed", () => {
        expect(deriveSalt(seed, "bcrypt")).toEqual(deriveSalt(seed, "bcrypt"));
    });

    test("takes the leading bytes of the pool", () => {
        expect([...deriveSalt(seed, "bcrypt")]).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        ]);
    });

    test("repeats a short seed rather than padding it with nulls", () => {
        const short = Buffer.from(new Uint8Array([1, 2, 3])).toString("base64");

        expect([...deriveSalt(short, "bcrypt")]).toEqual([
            1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1,
        ]);
    });

    test("throws on a seed that decodes to nothing, which is programmer error", () => {
        expect(() => deriveSalt("", "bcrypt")).toThrow();
    });
});
