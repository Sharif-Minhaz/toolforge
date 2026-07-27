import { describe, expect, test } from "bun:test";

import { READING_WORDS_PER_MINUTE } from "@/modules/markdown/domain/constants";
import { describeDocument } from "@/modules/markdown/domain/statistics";

describe("describeDocument", () => {
    test("reports an empty document as one line and nothing else", () => {
        expect(describeDocument("")).toEqual({
            words: 0,
            characters: 0,
            charactersNoSpaces: 0,
            lines: 1,
            readingMinutes: 0,
        });
    });

    test("counts words separated by any run of whitespace", () => {
        expect(describeDocument("one   two\tthree\nfour").words).toBe(4);
    });

    test("does not count leading or trailing whitespace as a word", () => {
        expect(describeDocument("   word   ").words).toBe(1);
    });

    test("counts characters by code point, so an emoji is one character", () => {
        expect(describeDocument("👋 hi").characters).toBe(4);
    });

    test("subtracts every whitespace character, not just spaces", () => {
        expect(describeDocument("a b\tc\nd").charactersNoSpaces).toBe(4);
    });

    test("counts a trailing newline as opening a further line", () => {
        expect(describeDocument("a\nb").lines).toBe(2);
        expect(describeDocument("a\nb\n").lines).toBe(3);
    });

    test("rounds reading time up, so a short note still reads as a minute", () => {
        expect(describeDocument("word").readingMinutes).toBe(1);
    });

    test("scales reading time with the word count", () => {
        const words = Array.from({ length: READING_WORDS_PER_MINUTE * 3 }, () => "word").join(" ");

        expect(describeDocument(words).readingMinutes).toBe(3);
    });

    test("counts the markdown as typed, syntax included", () => {
        // The syntax is what the author is looking at; a count that only
        // measured rendered prose would sit still while they typed a table.
        expect(describeDocument("## Heading").words).toBe(2);
    });
});
