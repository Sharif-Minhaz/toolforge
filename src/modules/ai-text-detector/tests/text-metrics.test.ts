import { describe, expect, test } from "bun:test";

import {
    countSentences,
    countWords,
    getTextMetrics,
} from "@/modules/ai-text-detector/domain/text-metrics";

describe("countWords", () => {
    test("counts plain words", () => {
        expect(countWords("The rapid advancement of artificial intelligence")).toBe(6);
    });

    test("keeps a hyphenated compound and a contraction as one word each", () => {
        expect(countWords("state-of-the-art isn’t easy")).toBe(3);
    });

    test("ignores punctuation standing alone", () => {
        expect(countWords("Yes — really! ... ?")).toBe(2);
    });

    test("counts Bangla words the same as Latin ones", () => {
        expect(countWords("কৃত্রিম বুদ্ধিমত্তা দ্রুত এগিয়ে যাচ্ছে")).toBe(5);
    });

    test("does not fragment a word at its combining marks", () => {
        expect(countWords("কৃত্রিম")).toBe(1);
    });

    test("does not swallow a trailing hyphen into the word", () => {
        expect(countWords("well- known")).toBe(2);
    });

    test("counts digits as words, since a figure occupies a slot in a sentence", () => {
        expect(countWords("It grew 40 percent in 2026")).toBe(6);
    });

    test("returns zero for an empty string", () => {
        expect(countWords("")).toBe(0);
    });
});

describe("countSentences", () => {
    test("splits on the three ASCII terminators", () => {
        expect(countSentences("One. Two! Three?")).toBe(3);
    });

    test("treats a run of terminators as one break", () => {
        expect(countSentences("Really?! Yes...")).toBe(2);
    });

    test("splits on the Bengali daṛi", () => {
        expect(countSentences("প্রথম বাক্য। দ্বিতীয় বাক্য।")).toBe(2);
    });

    test("counts a fragment with no terminator as one sentence", () => {
        expect(countSentences("a headline with no full stop")).toBe(1);
    });

    test("ignores a trailing terminator rather than inventing an empty sentence", () => {
        expect(countSentences("Only one.")).toBe(1);
    });

    test("returns zero for whitespace only", () => {
        expect(countSentences("   \n ")).toBe(0);
    });
});

describe("getTextMetrics", () => {
    test("reports every figure for a short passage", () => {
        expect(getTextMetrics("One two three. Four five.")).toEqual({
            characters: 25,
            words: 5,
            sentences: 2,
            averageSentenceWords: 2.5,
            uniqueWordRatio: 100,
        });
    });

    test("counts repeats against the unique-word ratio, case-insensitively", () => {
        expect(getTextMetrics("The the THE cat.").uniqueWordRatio).toBe(50);
    });

    test("rounds the sentence average to one decimal place", () => {
        expect(getTextMetrics("a b c. d e.").averageSentenceWords).toBe(2.5);
        expect(getTextMetrics("a b c d. e f.").averageSentenceWords).toBe(3);
        expect(getTextMetrics("a b c d e. f g.").averageSentenceWords).toBe(3.5);
    });

    test("measures the trimmed passage", () => {
        expect(getTextMetrics("   hello world.   ").characters).toBe(12);
    });

    test("is all zeroes for empty input rather than NaN", () => {
        expect(getTextMetrics("  ")).toEqual({
            characters: 0,
            words: 0,
            sentences: 0,
            averageSentenceWords: 0,
            uniqueWordRatio: 0,
        });
    });

    test("never divides by zero when the passage holds punctuation only", () => {
        const metrics = getTextMetrics("!!! ???");

        expect(metrics.words).toBe(0);
        expect(metrics.uniqueWordRatio).toBe(0);
        expect(metrics.averageSentenceWords).toBe(0);
    });
});
