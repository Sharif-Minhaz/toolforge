import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
    DIGEST_BASE64_LENGTHS,
    DIGEST_HEX_LENGTHS,
    digestText,
} from "@/modules/hash/domain/digest";
import { DIGEST_ALGORITHMS, type DigestAlgorithm } from "@/modules/hash/types";

/**
 * Published vectors: MD5 from RFC 1321 §A.5, SHA-1 and SHA-256 from FIPS 180-4.
 * Only the ones short enough to transcribe without error are literals here —
 * everything else is cross-checked against `node:crypto` below, which is an
 * independent implementation rather than a hash written down from memory.
 */
const VECTORS: ReadonlyArray<{ algorithm: DigestAlgorithm; input: string; hex: string }> = [
    { algorithm: "md5", input: "", hex: "d41d8cd98f00b204e9800998ecf8427e" },
    { algorithm: "md5", input: "abc", hex: "900150983cd24fb0d6963f7d28e17f72" },
    { algorithm: "sha1", input: "abc", hex: "a9993e364706816aba3e25717850c26c9cd0d89d" },
    {
        algorithm: "sha256",
        input: "abc",
        hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
];

/** Node's own digest of the same UTF-8 bytes, used as the oracle. */
function reference(input: string, algorithm: DigestAlgorithm): string {
    const nodeName = algorithm === "sha1" ? "sha1" : algorithm;

    return createHash(nodeName).update(input, "utf8").digest("hex");
}

const INPUTS = [
    "",
    "abc",
    "message digest",
    "The quick brown fox jumps over the lazy dog",
    // Multi-byte on purpose: a digest over UTF-16 code units would disagree.
    "héllo wörld",
    "স্বাগতম",
    "🔐🧂",
    "a".repeat(1_000),
];

describe("digestText", () => {
    for (const vector of VECTORS) {
        test(`${vector.algorithm} matches the published vector for ${JSON.stringify(vector.input)}`, async () => {
            expect(await digestText(vector.input, vector.algorithm, "hex")).toBe(vector.hex);
        });
    }

    for (const algorithm of DIGEST_ALGORITHMS) {
        for (const input of INPUTS) {
            test(`${algorithm} agrees with node:crypto for ${JSON.stringify(input.slice(0, 24))}`, async () => {
                expect(await digestText(input, algorithm, "hex")).toBe(reference(input, algorithm));
            });
        }
    }

    test("upper-cases hex only when asked", async () => {
        expect(await digestText("abc", "md5", "hex", true)).toBe(
            "900150983CD24FB0D6963F7D28E17F72",
        );
    });

    test("leaves base64 alone even when the case toggle is set", async () => {
        // Base64 is case-significant: upper-casing it would be a different,
        // wrong value rather than the same hash written differently.
        const plain = await digestText("abc", "sha256", "base64");

        expect(await digestText("abc", "sha256", "base64", true)).toBe(plain);
        expect(plain).toBe("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
    });

    test("base64 and hex describe the same bytes", async () => {
        const hex = await digestText("abc", "md5", "hex");
        const base64 = await digestText("abc", "md5", "base64");

        expect(Buffer.from(base64, "base64").toString("hex")).toBe(hex);
    });
});

describe("digest length tables", () => {
    for (const algorithm of DIGEST_ALGORITHMS) {
        test(`${algorithm} hex and base64 lengths match what it actually emits`, async () => {
            expect(await digestText("abc", algorithm, "hex")).toHaveLength(
                DIGEST_HEX_LENGTHS[algorithm],
            );
            expect(await digestText("abc", algorithm, "base64")).toHaveLength(
                DIGEST_BASE64_LENGTHS[algorithm],
            );
        });
    }

    test("every algorithm has a distinct length, which is what makes detection work", () => {
        const hexLengths = DIGEST_ALGORITHMS.map((name) => DIGEST_HEX_LENGTHS[name]);
        const base64Lengths = DIGEST_ALGORITHMS.map((name) => DIGEST_BASE64_LENGTHS[name]);

        expect(new Set(hexLengths).size).toBe(DIGEST_ALGORITHMS.length);
        expect(new Set(base64Lengths).size).toBe(DIGEST_ALGORITHMS.length);
    });
});
