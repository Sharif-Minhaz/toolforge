import { describe, expect, test } from "bun:test";

import { PASSPHRASE_WORDS } from "@/modules/password/domain/wordlist";

describe("PASSPHRASE_WORDS", () => {
    test("holds exactly 1024 words, so one word is exactly ten bits", () => {
        expect(PASSPHRASE_WORDS).toHaveLength(1024);
        expect(Math.log2(PASSPHRASE_WORDS.length)).toBe(10);
    });

    test("has no duplicates — a repeat would quietly cost entropy", () => {
        expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
    });

    test("is lowercase ASCII letters only", () => {
        const offenders = PASSPHRASE_WORDS.filter((word) => !/^[a-z]+$/.test(word));

        expect(offenders).toEqual([]);
    });

    test("keeps every word between three and eight letters", () => {
        const offenders = PASSPHRASE_WORDS.filter((word) => word.length < 3 || word.length > 8);

        expect(offenders).toEqual([]);
    });
});
