import { describe, expect, test } from "bun:test";

import { detectHash } from "@/modules/hash/domain/detect";
import { digestText } from "@/modules/hash/domain/digest";
import { DIGEST_ALGORITHMS, BCRYPT_PREFIXES } from "@/modules/hash/types";

/** A real bcrypt hash of "abc" at cost 6, from the jBCrypt published vectors. */
const BCRYPT_ABC = "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i";

/** From the argon2 reference CLI: `argon2 somesalt -t 2 -m 16 -p 4 -l 24`. */
const ARGON2I_PASSWORD =
    "$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

describe("detectHash on bcrypt", () => {
    test("reads the cost out of the hash", () => {
        expect(detectHash(BCRYPT_ABC)).toEqual({
            family: "bcrypt",
            prefix: "$2a$",
            cost: 6,
        });
    });

    for (const prefix of BCRYPT_PREFIXES) {
        test(`recognises the ${prefix} marker`, () => {
            const detected = detectHash(prefix + BCRYPT_ABC.slice(4));

            expect(detected).toEqual({ family: "bcrypt", prefix, cost: 6 });
        });
    }

    test("keeps a two-digit cost intact", () => {
        const detected = detectHash(`$2b$12$${BCRYPT_ABC.slice(7)}`);

        expect(detected).toEqual({ family: "bcrypt", prefix: "$2b$", cost: 12 });
    });

    test("rejects a truncated bcrypt hash rather than guessing", () => {
        expect(detectHash(BCRYPT_ABC.slice(0, -1))).toBeNull();
    });

    test("rejects an unknown version letter", () => {
        expect(detectHash(`$2c$06$${BCRYPT_ABC.slice(7)}`)).toBeNull();
    });

    test("rejects a character outside bcrypt's alphabet", () => {
        // `+` is in RFC 4648 base64 but not in bcrypt's `./A-Za-z0-9`.
        expect(detectHash(`$2a$06$+${BCRYPT_ABC.slice(8)}`)).toBeNull();
    });
});

describe("detectHash on argon2", () => {
    test("reads every parameter out of the encoded hash", () => {
        expect(detectHash(ARGON2I_PASSWORD)).toEqual({
            family: "argon2",
            variant: "argon2i",
            version: 19,
            memory: 65_536,
            iterations: 2,
            parallelism: 4,
        });
    });

    for (const variant of ["argon2id", "argon2i", "argon2d"] as const) {
        test(`recognises ${variant}`, () => {
            const hash = `$${variant}$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG`;
            const detected = detectHash(hash);

            expect(detected).toMatchObject({ family: "argon2", variant });
        });
    }

    test("rejects a hash missing its parameter block", () => {
        expect(detectHash("$argon2id$v=19$c29tZXNhbHQ$RdescudvJCsgt3ub")).toBeNull();
    });

    test("rejects an unknown argon2 variant", () => {
        expect(detectHash("$argon2x$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub")).toBeNull();
    });
});

describe("detectHash on bare digests", () => {
    for (const algorithm of DIGEST_ALGORITHMS) {
        test(`identifies a real ${algorithm} hex digest`, async () => {
            const hash = await digestText("abc", algorithm, "hex");

            expect(detectHash(hash)).toEqual({ family: "digest", algorithm, encoding: "hex" });
        });

        test(`identifies a real ${algorithm} base64 digest`, async () => {
            const hash = await digestText("abc", algorithm, "base64");

            expect(detectHash(hash)).toEqual({ family: "digest", algorithm, encoding: "base64" });
        });
    }

    test("treats upper-case hex the same as lower", async () => {
        const hash = await digestText("abc", "sha256", "hex");

        expect(detectHash(hash.toUpperCase())).toEqual({
            family: "digest",
            algorithm: "sha256",
            encoding: "hex",
        });
    });

    test("rejects a hex string of the wrong length", () => {
        expect(detectHash("a".repeat(33))).toBeNull();
        expect(detectHash("a".repeat(63))).toBeNull();
    });

    test("rejects plain text", () => {
        expect(detectHash("correct horse battery staple")).toBeNull();
        expect(detectHash("not a hash")).toBeNull();
    });

    test("rejects an empty or whitespace-only value", () => {
        expect(detectHash("")).toBeNull();
        expect(detectHash("   \n ")).toBeNull();
    });
});

describe("detectHash trimming", () => {
    test("ignores whitespace around a pasted hash", () => {
        expect(detectHash(`\n  ${BCRYPT_ABC}  \t`)).toEqual({
            family: "bcrypt",
            prefix: "$2a$",
            cost: 6,
        });
    });
});
