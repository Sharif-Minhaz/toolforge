import { describe, expect, test } from "bun:test";

import {
    BULLET_MARKERS,
    formatOrdinal,
    hasMarker,
    ordinalWidth,
    stripMarker,
    toAlphabetic,
    toRoman,
} from "@/modules/sort/domain/markers";

describe("stripMarker — reading a list marker off a line", () => {
    test("takes every bullet character a paste can arrive with", () => {
        for (const bullet of ["-", "*", "+", "•", "‣", "▪", "◦", "·", "–", "—", "→"]) {
            expect(stripMarker(`${bullet} apples`)).toEqual({ text: "apples", hadMarker: true });
        }
    });

    test("takes the indentation in front of the marker with it", () => {
        expect(stripMarker("    - apples").text).toBe("apples");
        expect(stripMarker("\t1. apples").text).toBe("apples");
    });

    test("leaves the indentation alone when there is no marker", () => {
        expect(stripMarker("    apples")).toEqual({ text: "    apples", hadMarker: false });
    });

    test("takes a Markdown task box along with its bullet", () => {
        expect(stripMarker("- [ ] ship it").text).toBe("ship it");
        expect(stripMarker("* [x] shipped").text).toBe("shipped");
        expect(stripMarker("- [X] shipped").text).toBe("shipped");
    });

    test("takes decimal, bracketed and parenthesised ordinals", () => {
        expect(stripMarker("1. apples").text).toBe("apples");
        expect(stripMarker("12) apples").text).toBe("apples");
        expect(stripMarker("(3) apples").text).toBe("apples");
        expect(stripMarker("[4] apples").text).toBe("apples");
    });

    test("takes single-letter and roman ordinals", () => {
        expect(stripMarker("a. apples").text).toBe("apples");
        expect(stripMarker("b) apples").text).toBe("apples");
        expect(stripMarker("iv. apples").text).toBe("apples");
        expect(stripMarker("IV. apples").text).toBe("apples");
    });

    /**
     * The reason the letter form is one character and the roman form is two or
     * more. Both of these are prose that opens with something shaped like a
     * label, and eating it would change what the line says.
     */
    test("leaves an ordinary abbreviation alone", () => {
        expect(stripMarker("Mr. Smith").hadMarker).toBe(false);
        expect(stripMarker("So. What happens next").hadMarker).toBe(false);
        expect(stripMarker("e.g. apples").hadMarker).toBe(false);
    });

    test("leaves a YAML mapping alone, colons not being list punctuation", () => {
        expect(stripMarker("a: apples").hadMarker).toBe(false);
        expect(stripMarker("name: apples").hadMarker).toBe(false);
    });

    test("does not mistake a negative number or a rule for a bullet", () => {
        expect(stripMarker("-5 degrees").hadMarker).toBe(false);
        expect(stripMarker("--- ").hadMarker).toBe(false);
    });

    test("reports a blank line as unmarked and hands it back untouched", () => {
        expect(stripMarker("   ")).toEqual({ text: "   ", hadMarker: false });
    });

    test("hasMarker answers the same question without the text", () => {
        expect(hasMarker("2. second")).toBe(true);
        expect(hasMarker("second")).toBe(false);
    });

    /**
     * The invariant that keeps a re-listed list from growing markers: anything
     * this file writes, it must also be able to read back off.
     */
    test("strips back every marker this tool can write", () => {
        for (const marker of Object.values(BULLET_MARKERS)) {
            expect(stripMarker(`${marker} apples`).text).toBe("apples");
        }

        for (const style of ["decimal", "paren", "padded", "alpha", "roman"] as const) {
            const written = formatOrdinal(style, 4, 2);

            expect(stripMarker(`${written} apples`).text).toBe("apples");
        }
    });
});

describe("ordinal labels", () => {
    test("counts in bijective base 26", () => {
        expect(toAlphabetic(1)).toBe("a");
        expect(toAlphabetic(26)).toBe("z");
        expect(toAlphabetic(27)).toBe("aa");
        expect(toAlphabetic(52)).toBe("az");
        expect(toAlphabetic(53)).toBe("ba");
    });

    test("writes roman numerals, subtractive forms included", () => {
        expect(toRoman(1)).toBe("i");
        expect(toRoman(4)).toBe("iv");
        expect(toRoman(9)).toBe("ix");
        expect(toRoman(14)).toBe("xiv");
        expect(toRoman(40)).toBe("xl");
        expect(toRoman(1987)).toBe("mcmlxxxvii");
    });

    test("writes each style the way its list reads", () => {
        expect(formatOrdinal("decimal", 7, 2)).toBe("7.");
        expect(formatOrdinal("paren", 7, 2)).toBe("7)");
        expect(formatOrdinal("padded", 7, 3)).toBe("007.");
        expect(formatOrdinal("alpha", 7, 2)).toBe("g.");
        expect(formatOrdinal("roman", 7, 2)).toBe("vii.");
    });

    /** Neither scheme has a zero, so the ordinal itself is the honest answer. */
    test("falls back to the decimal where roman and alphabetic have no label", () => {
        expect(formatOrdinal("alpha", 0, 2)).toBe("0.");
        expect(formatOrdinal("roman", 0, 2)).toBe("0.");
    });

    test("pads to the width the longest ordinal needs, never fewer than two", () => {
        expect(ordinalWidth(1, 9)).toBe(2);
        expect(ordinalWidth(1, 100)).toBe(3);
        expect(ordinalWidth(995, 10)).toBe(4);
        expect(ordinalWidth(1, 0)).toBe(2);
    });
});
