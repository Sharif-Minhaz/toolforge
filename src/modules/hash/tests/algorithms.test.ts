import { describe, expect, test } from "bun:test";

import {
    getHashFamily,
    isCollisionBroken,
    isPasswordHash,
    isValidArgon2Parameters,
    isValidBcryptCost,
    minimumArgon2Memory,
    supportsCaseToggle,
    supportsEncodingChoice,
} from "@/modules/hash/domain/algorithms";
import {
    DEFAULT_HASH_OPTIONS,
    MAX_BCRYPT_COST,
    MIN_BCRYPT_COST,
} from "@/modules/hash/domain/constants";
import { HASH_ALGORITHMS, type HashAlgorithm, type HashFamily } from "@/modules/hash/types";

const FAMILIES: ReadonlyArray<[HashAlgorithm, HashFamily]> = [
    ["md5", "digest"],
    ["sha1", "digest"],
    ["sha256", "digest"],
    ["sha512", "digest"],
    ["bcrypt", "bcrypt"],
    ["argon2id", "argon2"],
    ["argon2i", "argon2"],
    ["argon2d", "argon2"],
];

describe("getHashFamily", () => {
    for (const [algorithm, family] of FAMILIES) {
        test(`places ${algorithm} in the ${family} family`, () => {
            expect(getHashFamily(algorithm)).toBe(family);
        });
    }

    test("covers every algorithm in the union", () => {
        expect(FAMILIES.map(([algorithm]) => algorithm).toSorted()).toEqual(
            [...HASH_ALGORITHMS].toSorted(),
        );
    });
});

describe("algorithm advice", () => {
    test("flags only the collision-broken digests", () => {
        expect(HASH_ALGORITHMS.filter(isCollisionBroken)).toEqual(["md5", "sha1"]);
    });

    test("counts only the deliberately slow families as password hashes", () => {
        expect(HASH_ALGORITHMS.filter(isPasswordHash)).toEqual([
            "bcrypt",
            "argon2id",
            "argon2i",
            "argon2d",
        ]);
    });
});

describe("option availability", () => {
    test("offers an encoding choice for digests only", () => {
        for (const [algorithm, family] of FAMILIES) {
            expect(supportsEncodingChoice({ ...DEFAULT_HASH_OPTIONS, algorithm })).toBe(
                family === "digest",
            );
        }
    });

    test("offers the case toggle only for hex digests", () => {
        expect(
            supportsCaseToggle({ ...DEFAULT_HASH_OPTIONS, algorithm: "sha256", encoding: "hex" }),
        ).toBe(true);
        expect(
            supportsCaseToggle({
                ...DEFAULT_HASH_OPTIONS,
                algorithm: "sha256",
                encoding: "base64",
            }),
        ).toBe(false);
        expect(
            supportsCaseToggle({ ...DEFAULT_HASH_OPTIONS, algorithm: "bcrypt", encoding: "hex" }),
        ).toBe(false);
    });
});

describe("isValidBcryptCost", () => {
    for (const cost of [MIN_BCRYPT_COST, 10, MAX_BCRYPT_COST]) {
        test(`accepts ${cost}`, () => {
            expect(isValidBcryptCost(cost)).toBe(true);
        });
    }

    for (const cost of [MIN_BCRYPT_COST - 1, MAX_BCRYPT_COST + 1, 0, -4, 10.5, Number.NaN]) {
        test(`rejects ${cost}`, () => {
            expect(isValidBcryptCost(cost)).toBe(false);
        });
    }
});

describe("isValidArgon2Parameters", () => {
    test("accepts the defaults", () => {
        expect(isValidArgon2Parameters(DEFAULT_HASH_OPTIONS)).toBe(true);
    });

    test("ties the memory floor to the lane count", () => {
        expect(
            isValidArgon2Parameters({
                ...DEFAULT_HASH_OPTIONS,
                argon2Parallelism: 4,
                argon2Memory: 31,
            }),
        ).toBe(false);
        expect(
            isValidArgon2Parameters({
                ...DEFAULT_HASH_OPTIONS,
                argon2Parallelism: 4,
                argon2Memory: 32,
            }),
        ).toBe(true);
    });
});

describe("minimumArgon2Memory", () => {
    test("never drops below the absolute floor", () => {
        expect(minimumArgon2Memory(1)).toBe(8);
    });

    test("scales with the lane count", () => {
        expect(minimumArgon2Memory(4)).toBe(32);
        expect(minimumArgon2Memory(16)).toBe(128);
    });
});
