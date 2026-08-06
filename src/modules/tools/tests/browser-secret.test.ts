import { describe, expect, test } from "bun:test";

import { hashCredential } from "@/modules/tools/domain/browser-secret";
import {
    createRecoveryKey,
    formatRecoveryKey,
    normalizeRecoveryKey,
} from "@/modules/tools/domain/recovery-key";
import type { RandomBytes } from "@/modules/tools/types";

const zeroBytes: RandomBytes = (length) => new Uint8Array(length);

describe("hashCredential", () => {
    /**
     * Pinned against a value nothing in this repository produced. If the digest
     * or its encoding ever changes, every stored server becomes unreachable,
     * so this is the one assertion here worth an external reference.
     */
    test("is SHA-256 in lower-case hex", async () => {
        expect(await hashCredential("abc")).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });

    test("hashes the empty string rather than refusing it", async () => {
        expect(await hashCredential("")).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });

    test("produces 64 hex characters for any input", async () => {
        expect(await hashCredential(createRecoveryKey(zeroBytes))).toMatch(/^[0-9a-f]{64}$/);
    });

    test("is stable across calls", async () => {
        const [first, second] = await Promise.all([hashCredential("abc"), hashCredential("abc")]);

        expect(first).toBe(second);
    });

    test("separates inputs that differ by one character", async () => {
        const [first, second] = await Promise.all([hashCredential("abc"), hashCredential("abd")]);

        expect(first).not.toBe(second);
    });

    /**
     * The property the whole import flow rests on: what a visitor types and
     * what was printed for them hash to the same value, whatever they did to
     * the spacing and case on the way.
     */
    test("agrees across every spelling of one recovery key", async () => {
        const canonical = "8QXKH72D9F5C4M2P";
        const spellings = [
            canonical,
            formatRecoveryKey(canonical),
            "8qxk-h72d-9f5c-4m2p",
            "  8QXK H72D\t9F5C\n4M2P  ",
        ];

        const digests = await Promise.all(
            spellings.map(async (spelling) => {
                const normalized = normalizeRecoveryKey(spelling);

                expect(normalized).not.toBeNull();

                return hashCredential(normalized as string);
            }),
        );

        expect(new Set(digests).size).toBe(1);
    });

    /** Case matters below normalisation — the folding is the recovery key's job. */
    test("does not fold case by itself", async () => {
        const [lower, upper] = await Promise.all([hashCredential("abc"), hashCredential("ABC")]);

        expect(lower).not.toBe(upper);
    });
});
