import { describe, expect, test } from "bun:test";

import { detectWrapWidth, splitIntoItems } from "@/modules/sort/domain/split";

/**
 * Prose that arrived with real newlines inside its sentences — a mail client's
 * quoting, a PDF's text layer, anything through `fmt`. Three lines, one
 * paragraph, and the whole reason `smart` mode exists.
 */
const WRAPPED = [
    "The quick brown fox jumps over the lazy dog and then runs away into",
    "the forest where nobody can find it. The bear was sleeping under a",
    "tree.",
].join("\n");

/** A numbered list whose first item wrapped. The `2.` must survive it. */
const WRAPPED_LIST = [
    "1. Install the package from the registry using your package manager",
    "   of choice before you continue",
    "2. Run the migration script and wait for it to finish completely",
    "3. Restart",
].join("\n");

describe("splitIntoItems — line mode", () => {
    test("cuts at every newline and nowhere else", () => {
        expect(splitIntoItems("a\nb\nc", "line").items).toEqual(["a", "b", "c"]);
        expect(splitIntoItems(WRAPPED, "line").items).toHaveLength(3);
    });

    test("reads every line ending the same way", () => {
        expect(splitIntoItems("a\r\nb\rc", "line").items).toEqual(["a", "b", "c"]);
    });

    test("joins nothing, and says so", () => {
        expect(splitIntoItems(WRAPPED, "line")).toMatchObject({ joined: 0, wrapWidth: null });
    });
});

describe("detectWrapWidth — is this text hard-wrapped at all", () => {
    test("finds the column when several lines reach for it", () => {
        expect(detectWrapWidth(WRAPPED.split("\n"))).toBe(67);
    });

    test("finds nothing in a short list, whatever its lines start with", () => {
        expect(detectWrapWidth(["apple", "banana", "cherry"])).toBeNull();
    });

    /**
     * The case that makes the two-line rule worth having. One long item among
     * short ones is indistinguishable from a wrapped line and its tail, so the
     * conservative reading wins and nothing is joined.
     */
    test("finds nothing when only one line is long", () => {
        expect(
            detectWrapWidth([
                "apple",
                "banana that has a really long description going on and on here",
                "cherry",
            ]),
        ).toBeNull();
    });
});

describe("splitIntoItems — smart mode", () => {
    test("folds a hard-wrapped paragraph back into one item", () => {
        const report = splitIntoItems(WRAPPED, "smart");

        expect(report.items).toEqual([
            "The quick brown fox jumps over the lazy dog and then runs away into the forest where nobody can find it. The bear was sleeping under a tree.",
        ]);
        expect(report.joined).toBe(2);
        expect(report.wrapWidth).toBe(67);
    });

    test("leaves a short list exactly as it was typed", () => {
        const report = splitIntoItems("apple\nbanana\ncherry", "smart");

        expect(report.items).toEqual(["apple", "banana", "cherry"]);
        expect(report.joined).toBe(0);
    });

    test("never folds a line that starts with a marker into the one above it", () => {
        const report = splitIntoItems(WRAPPED_LIST, "smart");

        expect(report.items).toEqual([
            "1. Install the package from the registry using your package manager of choice before you continue",
            "2. Run the migration script and wait for it to finish completely",
            "3. Restart",
        ]);
        expect(report.joined).toBe(1);
    });

    test("ends an item at a blank line", () => {
        const report = splitIntoItems("one\n\ntwo", "smart");

        expect(report.items).toEqual(["one", "", "two"]);
        expect(report.joined).toBe(0);
    });

    /**
     * A word split across the break is the one signal strong enough to act on
     * without a wrap column, because no writer ends a list item on a hyphen.
     */
    test("rejoins a word broken across the break, hyphen and all", () => {
        const report = splitIntoItems("inter-\nnational", "smart");

        expect(report.items).toEqual(["international"]);
        expect(report.joined).toBe(1);
    });

    test("stops at a full stop even where the line was long enough to continue", () => {
        const report = splitIntoItems(
            [
                "The quick brown fox jumps over the lazy dog and runs away home.",
                "The bear was still sleeping under the tree beside the river bank",
                "and did not wake up at all.",
            ].join("\n"),
            "smart",
        );

        expect(report.items).toHaveLength(2);
    });

    /**
     * The bug the physical-line rule exists to stop: once two lines are folded
     * the item is longer than any wrap column, so measuring the *item* would
     * swallow every short line after it.
     */
    test("measures the previous line, not the paragraph built so far", () => {
        const report = splitIntoItems(
            [
                "The quick brown fox jumps over the lazy dog and then runs away into",
                "the forest where nobody can find it. The bear was sleeping under a",
                "tree by the river",
                "Alice",
            ].join("\n"),
            "smart",
        );

        // The first three lines are one wrapped paragraph, and by the third the
        // item is well past any wrap column. `Alice` follows a seventeen
        // character line, so it is an item of its own.
        expect(report.items).toHaveLength(2);
        expect(report.items[1]).toBe("Alice");
    });
});

describe("splitIntoItems — paragraph mode", () => {
    test("ends an item only at a blank line", () => {
        const report = splitIntoItems("one\ntwo\n\nthree\nfour", "paragraph");

        expect(report.items).toEqual(["one two", "three four"]);
        expect(report.joined).toBe(2);
    });

    test("drops the blank lines themselves rather than keeping them as items", () => {
        expect(splitIntoItems("\n\none\n\n\n", "paragraph").items).toEqual(["one"]);
    });

    test("asks no questions about line length, so it never guesses wrong", () => {
        expect(splitIntoItems("apple\nbanana\ncherry", "paragraph").items).toEqual([
            "apple banana cherry",
        ]);
    });
});
