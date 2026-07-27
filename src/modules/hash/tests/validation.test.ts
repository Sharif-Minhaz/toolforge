import { describe, expect, test } from "bun:test";

import { DEFAULT_HASH_OPTIONS, MAX_BCRYPT_COST } from "@/modules/hash/domain/constants";
import { hashOptionsSchema, hashSearchParamsSchema } from "@/modules/hash/validation/hash-options";

describe("hashOptionsSchema", () => {
    test("accepts the defaults", () => {
        expect(hashOptionsSchema.safeParse(DEFAULT_HASH_OPTIONS).success).toBe(true);
    });

    test("rejects an unknown algorithm", () => {
        expect(
            hashOptionsSchema.safeParse({ ...DEFAULT_HASH_OPTIONS, algorithm: "sha3" }).success,
        ).toBe(false);
    });

    test("rejects a cost past the ceiling", () => {
        expect(
            hashOptionsSchema.safeParse({
                ...DEFAULT_HASH_OPTIONS,
                bcryptCost: MAX_BCRYPT_COST + 1,
            }).success,
        ).toBe(false);
    });

    test("enforces the 8 KiB per lane rule across fields", () => {
        expect(
            hashOptionsSchema.safeParse({
                ...DEFAULT_HASH_OPTIONS,
                argon2Parallelism: 4,
                argon2Memory: 16,
            }).success,
        ).toBe(false);
        expect(
            hashOptionsSchema.safeParse({
                ...DEFAULT_HASH_OPTIONS,
                argon2Parallelism: 4,
                argon2Memory: 32,
            }).success,
        ).toBe(true);
    });

    test("rejects a fractional memory cost", () => {
        expect(
            hashOptionsSchema.safeParse({ ...DEFAULT_HASH_OPTIONS, argon2Memory: 1024.5 }).success,
        ).toBe(false);
    });
});

describe("hashSearchParamsSchema", () => {
    test("reads a well-formed link", () => {
        const parsed = hashSearchParamsSchema.parse({
            mode: "compare",
            algorithm: "argon2id",
            encoding: "base64",
            cost: "12",
            memory: "46080",
            iterations: "3",
        });

        expect(parsed).toEqual({
            mode: "compare",
            algorithm: "argon2id",
            encoding: "base64",
            cost: 12,
            memory: 46_080,
            iterations: 3,
        });
    });

    test("degrades one malformed field without losing the rest", () => {
        const parsed = hashSearchParamsSchema.parse({
            mode: "generate",
            algorithm: "not-an-algorithm",
            cost: "999",
        });

        expect(parsed).toEqual({
            mode: "generate",
            algorithm: undefined,
            encoding: undefined,
            cost: undefined,
            memory: undefined,
            iterations: undefined,
        });
    });

    test("survives an entirely empty query", () => {
        expect(hashSearchParamsSchema.parse({})).toEqual({
            mode: undefined,
            algorithm: undefined,
            encoding: undefined,
            cost: undefined,
            memory: undefined,
            iterations: undefined,
        });
    });

    test("does not accept a parameter carrying the text to hash", () => {
        const parsed = hashSearchParamsSchema.parse({ text: "hunter2", password: "hunter2" });

        expect(parsed).not.toHaveProperty("text");
        expect(parsed).not.toHaveProperty("password");
    });

    test("ignores an array value the way a repeated query key arrives", () => {
        const parsed = hashSearchParamsSchema.parse({ mode: ["compare", "generate"] });

        expect(parsed.mode).toBeUndefined();
    });
});
