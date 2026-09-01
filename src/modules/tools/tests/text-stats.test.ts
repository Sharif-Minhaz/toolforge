import { describe, expect, test } from "bun:test";

import { describeText } from "@/modules/tools/domain/text-stats";

describe("describeText — the counters under the boxes", () => {
    test("counts characters, words and lines", () => {
        expect(describeText("hello world")).toEqual({ characters: 11, words: 2, lines: 1 });
        expect(describeText("one\ntwo\nthree")).toEqual({ characters: 13, words: 3, lines: 3 });
    });

    test("calls an empty box one line and nothing else", () => {
        expect(describeText("")).toEqual({ characters: 0, words: 0, lines: 1 });
    });

    test("does not score leading or trailing space as a word", () => {
        expect(describeText("   hello   ").words).toBe(1);
    });

    test("counts characters as code points, not UTF-16 units", () => {
        // One emoji, one Bangla conjunct with its vowel mark.
        expect(describeText("🙂").characters).toBe(1);
        expect(describeText("কি").characters).toBe(2);
    });

    test("counts every line ending the same way", () => {
        expect(describeText("a\r\nb").lines).toBe(2);
        expect(describeText("a\rb").lines).toBe(2);
        expect(describeText("a\nb").lines).toBe(2);
    });
});
