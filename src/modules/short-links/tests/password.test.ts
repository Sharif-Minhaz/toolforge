import { describe, expect, test } from "bun:test";

import { PASSWORD_LENGTH, PBKDF2_ITERATIONS } from "@/modules/short-links/domain/constants";
import {
    checkPasswordLength,
    hashLinkPassword,
    verifyLinkPassword,
} from "@/modules/short-links/domain/password";
import type { RandomBytes } from "@/modules/tools/types";

/** A salt source that varies with the seed, so two hashes can be told apart. */
function fixedBytes(fill: number): RandomBytes {
    return (length) => new Uint8Array(length).fill(fill);
}

async function hashOrThrow(password: string, randomBytes?: RandomBytes): Promise<string> {
    const result = await hashLinkPassword(password, randomBytes ?? fixedBytes(7));

    if (!result.ok) {
        throw new Error(`expected a hash, got ${result.reason}`);
    }

    return result.hash;
}

describe("checkPasswordLength", () => {
    test("holds both ends of the range", () => {
        expect(checkPasswordLength("a".repeat(PASSWORD_LENGTH.min))).toBeNull();
        expect(checkPasswordLength("a".repeat(PASSWORD_LENGTH.max))).toBeNull();
        expect(checkPasswordLength("a".repeat(PASSWORD_LENGTH.min - 1))).toBe("weak_password");
        expect(checkPasswordLength("a".repeat(PASSWORD_LENGTH.max + 1))).toBe("password_too_long");
    });

    test("an empty password is refused rather than treated as no password", () => {
        expect(checkPasswordLength("")).toBe("weak_password");
    });
});

describe("hashLinkPassword", () => {
    test("carries its own parameters, so the cost can be raised later", async () => {
        const hash = await hashOrThrow("correct horse");
        const parts = hash.split("$");

        expect(parts).toHaveLength(5);
        expect(parts[0]).toBe("pbkdf2");
        expect(parts[1]).toBe("sha256");
        expect(Number(parts[2])).toBe(PBKDF2_ITERATIONS);
    });

    test("never stores the password itself", async () => {
        const hash = await hashOrThrow("correct horse");

        expect(hash).not.toContain("correct");
        expect(hash).not.toContain("horse");
    });

    test("a different salt gives a different digest for the same password", async () => {
        const [first, second] = await Promise.all([
            hashOrThrow("same password", fixedBytes(1)),
            hashOrThrow("same password", fixedBytes(2)),
        ]);

        expect(first).not.toBe(second);
        expect(await verifyLinkPassword("same password", first)).toBe(true);
        expect(await verifyLinkPassword("same password", second)).toBe(true);
    });

    test("refuses a password outside the range instead of hashing it", async () => {
        expect(await hashLinkPassword("abc", fixedBytes(1))).toEqual({
            ok: false,
            reason: "weak_password",
        });
        expect(await hashLinkPassword("a".repeat(PASSWORD_LENGTH.max + 1), fixedBytes(1))).toEqual({
            ok: false,
            reason: "password_too_long",
        });
    });
});

describe("verifyLinkPassword", () => {
    test("accepts the password it was built from and nothing else", async () => {
        const hash = await hashOrThrow("open sesame");

        expect(await verifyLinkPassword("open sesame", hash)).toBe(true);
        expect(await verifyLinkPassword("open sesam", hash)).toBe(false);
        expect(await verifyLinkPassword("Open Sesame", hash)).toBe(false);
        expect(await verifyLinkPassword("", hash)).toBe(false);
    });

    test("survives a password that is not ASCII", async () => {
        const hash = await hashOrThrow("পাসওয়ার্ড");

        expect(await verifyLinkPassword("পাসওয়ার্ড", hash)).toBe(true);
        expect(await verifyLinkPassword("পাসওয়ার্ড ", hash)).toBe(false);
    });

    test("a corrupted row locks the link rather than opening it", async () => {
        const hash = await hashOrThrow("open sesame");

        for (const broken of [
            "",
            "not-a-hash",
            hash.replace("pbkdf2", "bcrypt"),
            hash.replace("sha256", "sha512"),
            hash.split("$").slice(0, 4).join("$"),
            hash.replace(String(PBKDF2_ITERATIONS), "0"),
            hash.replace(String(PBKDF2_ITERATIONS), "-1"),
            hash.replace(String(PBKDF2_ITERATIONS), "abc"),
        ]) {
            expect(await verifyLinkPassword("open sesame", broken)).toBe(false);
        }
    });

    test("a tampered digest does not verify", async () => {
        const parts = (await hashOrThrow("open sesame")).split("$");
        const flipped = parts[4].startsWith("A")
            ? `B${parts[4].slice(1)}`
            : `A${parts[4].slice(1)}`;

        expect(
            await verifyLinkPassword("open sesame", [...parts.slice(0, 4), flipped].join("$")),
        ).toBe(false);
    });
});
