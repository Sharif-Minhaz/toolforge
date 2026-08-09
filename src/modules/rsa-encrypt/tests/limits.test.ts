import { describe, expect, test } from "bun:test";

import { maxOaepMessageBytes, minModulusBitsFor, rsaCiphertextBytes } from "../domain/limits";

describe("rsaCiphertextBytes", () => {
    test("is the modulus rounded up to whole bytes, and never the message size", () => {
        expect(rsaCiphertextBytes(1024)).toBe(128);
        expect(rsaCiphertextBytes(2048)).toBe(256);
        expect(rsaCiphertextBytes(4096)).toBe(512);
    });

    test("rounds a modulus that is not a whole number of bytes upwards", () => {
        expect(rsaCiphertextBytes(1023)).toBe(128);
    });
});

describe("maxOaepMessageBytes", () => {
    /**
     * RFC 8017 §7.1.1: `k - 2·hLen - 2`. These four are the numbers a reader
     * will meet in practice, and 190 is the one they will meet most.
     */
    test("matches the figures RFC 8017 gives for the common key widths", () => {
        expect(maxOaepMessageBytes(2048, "SHA-256")).toBe(190);
        expect(maxOaepMessageBytes(2048, "SHA-384")).toBe(158);
        expect(maxOaepMessageBytes(2048, "SHA-512")).toBe(126);
        expect(maxOaepMessageBytes(4096, "SHA-256")).toBe(446);
    });

    test("shrinks the allowance as the digest widens", () => {
        const bytes = (["SHA-256", "SHA-384", "SHA-512"] as const).map((hash) =>
            maxOaepMessageBytes(2048, hash),
        );

        expect(bytes).toEqual([...bytes].sort((a, b) => (b ?? 0) - (a ?? 0)));
    });

    /**
     * The combination that has no message at all: a 1024-bit key needs 130
     * bytes of SHA-512 overhead inside a 128-byte modulus. This is its own
     * refusal precisely because "shorten the message" is advice nobody can act
     * on here.
     */
    test("is null when the digest cannot fit inside the modulus at all", () => {
        expect(maxOaepMessageBytes(1024, "SHA-512")).toBeNull();
        expect(maxOaepMessageBytes(512, "SHA-256")).toBeNull();
    });

    test("still allows an empty message exactly at the boundary", () => {
        expect(maxOaepMessageBytes(minModulusBitsFor("SHA-512"), "SHA-512")).toBe(0);
        expect(maxOaepMessageBytes(minModulusBitsFor("SHA-256"), "SHA-256")).toBe(0);
    });
});

describe("minModulusBitsFor", () => {
    test("names the width each digest starts working at", () => {
        expect(minModulusBitsFor("SHA-256")).toBe(528);
        expect(minModulusBitsFor("SHA-384")).toBe(784);
        expect(minModulusBitsFor("SHA-512")).toBe(1040);
    });

    /** Which is why 1024 is not enough for SHA-512, by sixteen bits. */
    test("puts SHA-512 just above the 1024-bit key people reach for", () => {
        expect(minModulusBitsFor("SHA-512")).toBeGreaterThan(1024);
    });
});
