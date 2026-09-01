import { describe, expect, test } from "bun:test";

import {
    DEFAULT_SORT_OPTIONS,
    MAX_SORT_INPUT_LENGTH,
    MAX_SORT_ITEMS,
} from "@/modules/sort/domain/constants";
import { sortLines } from "@/modules/sort/domain/sort-lines";
import type { SortOptions } from "@/modules/sort/types";

const SEED = 12345;

function run(text: string, patch: Partial<SortOptions> = {}) {
    return sortLines(text, { ...DEFAULT_SORT_OPTIONS, ...patch }, SEED);
}

function output(text: string, patch: Partial<SortOptions> = {}): string {
    const result = run(text, patch);

    if (!result.ok) {
        throw new Error(`expected a result, got ${result.reason}`);
    }

    return result.text;
}

describe("ordering", () => {
    test("sorts ascending by default", () => {
        expect(output("cherry\napple\nbanana")).toBe("apple\nbanana\ncherry");
    });

    test("sorts descending", () => {
        expect(output("apple\ncherry\nbanana", { order: "descending" })).toBe(
            "cherry\nbanana\napple",
        );
    });

    test("leaves the order alone when asked to", () => {
        expect(output("cherry\napple", { order: "original" })).toBe("cherry\napple");
    });

    /** Reverse flips what arrived; descending sorts. Two different answers. */
    test("reverses without sorting", () => {
        expect(output("cherry\napple\nbanana", { order: "reverse" })).toBe("banana\napple\ncherry");
    });

    test("shuffles the same way for the same seed and differently for another", () => {
        const items = "a\nb\nc\nd\ne\nf\ng\nh";
        const first = sortLines(items, { ...DEFAULT_SORT_OPTIONS, order: "shuffle" }, 7);
        const again = sortLines(items, { ...DEFAULT_SORT_OPTIONS, order: "shuffle" }, 7);
        const other = sortLines(items, { ...DEFAULT_SORT_OPTIONS, order: "shuffle" }, 8);

        expect(first).toEqual(again);
        expect(first.ok && other.ok && first.text).not.toBe(other.ok ? other.text : "");
        expect(first.ok && [...first.items].sort()).toEqual([
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
        ]);
    });
});

describe("cleanup", () => {
    test("trims and drops blank lines by default", () => {
        expect(output("  b  \n\n a \n   \n")).toBe("a\nb");
    });

    test("keeps blank lines and whitespace when both switches are off", () => {
        expect(output("b\n\na", { order: "original", trim: false, removeEmpty: false })).toBe(
            "b\n\na",
        );
    });

    test("removes duplicates, folding case unless told otherwise", () => {
        expect(output("Apple\napple\nbanana", { removeDuplicates: true })).toBe("Apple\nbanana");
        expect(
            output("Apple\napple\nbanana", { removeDuplicates: true, caseSensitive: true }),
        ).toBe("Apple\napple\nbanana");
    });

    test("counts what it removed", () => {
        const result = run("a\n\na\nb\n\n", { removeDuplicates: true });

        expect(result.ok && result.counts).toMatchObject({
            blanksRemoved: 3,
            duplicatesRemoved: 1,
            items: 2,
        });
    });

    test("strips the markers a list already carries", () => {
        expect(output("- cherry\n- apple\n- banana")).toBe("apple\nbanana\ncherry");
        expect(output("1. cherry\n2. apple", { order: "original" })).toBe("cherry\napple");
    });

    test("keeps the markers when the switch is off, and then sorts by them", () => {
        expect(output("2. banana\n1. apple", { stripMarkers: false })).toBe("1. apple\n2. banana");
    });
});

describe("formatting", () => {
    test("writes a bullet list in each style", () => {
        expect(output("b\na", { format: "bullet" })).toBe("- a\n- b");
        expect(output("b\na", { format: "bullet", bulletStyle: "asterisk" })).toBe("* a\n* b");
        expect(output("b\na", { format: "bullet", bulletStyle: "bullet" })).toBe("• a\n• b");
        expect(output("b\na", { format: "bullet", bulletStyle: "task" })).toBe("- [ ] a\n- [ ] b");
    });

    test("writes a numbered list in each style", () => {
        const text = "b\na\nc";

        expect(output(text, { format: "numbered" })).toBe("1. a\n2. b\n3. c");
        expect(output(text, { format: "numbered", numberStyle: "paren" })).toBe("1) a\n2) b\n3) c");
        expect(output(text, { format: "numbered", numberStyle: "padded" })).toBe(
            "01. a\n02. b\n03. c",
        );
        expect(output(text, { format: "numbered", numberStyle: "alpha" })).toBe("a. a\nb. b\nc. c");
        expect(output(text, { format: "numbered", numberStyle: "roman" })).toBe(
            "i. a\nii. b\niii. c",
        );
    });

    test("starts the numbering where it was asked to", () => {
        expect(output("b\na", { format: "numbered", startNumber: 10 })).toBe("10. a\n11. b");
        expect(output("b\na", { format: "numbered", startNumber: 0 })).toBe("0. a\n1. b");
    });

    test("widens the padding to fit the last ordinal", () => {
        const items = Array.from({ length: 10 }, (_, index) => `item${index}`).join("\n");

        expect(
            output(items, { format: "numbered", numberStyle: "padded", startNumber: 995 }),
        ).toContain("1004. item9");
    });

    /**
     * The markers go on after the sort. Numbering before it would sort the
     * ordinals along with the text and hand back `2. apple` above `1. banana`.
     */
    test("numbers the sorted order rather than sorting the numbers", () => {
        expect(output("zebra\napple", { format: "numbered" })).toBe("1. apple\n2. zebra");
    });

    test("re-listing its own output does not stack markers", () => {
        const once = output("cherry\napple", { format: "bullet" });

        expect(output(once, { format: "numbered" })).toBe("1. apple\n2. cherry");
    });
});

describe("the smart split, end to end", () => {
    test("bullets a hard-wrapped paragraph as one item, not as three", () => {
        const wrapped = [
            "The quick brown fox jumps over the lazy dog and then runs away into",
            "the forest where nobody can find it. The bear was sleeping under a",
            "tree.",
        ].join("\n");

        const result = run(wrapped, { format: "bullet", order: "original" });

        expect(result.ok && result.items).toHaveLength(1);
        expect(result.ok && result.counts.joined).toBe(2);
        // Reported alongside the count, so the status strip can name the column
        // the heuristic settled on rather than just asserting it found one.
        expect(result.ok && result.counts.wrapWidth).toBe(67);
        expect(result.ok && result.text.startsWith("- The quick")).toBe(true);
    });

    test("line mode makes the same paste three bullets", () => {
        const wrapped = [
            "The quick brown fox jumps over the lazy dog and then runs away into",
            "the forest where nobody can find it. The bear was sleeping under a",
            "tree.",
        ].join("\n");

        const result = run(wrapped, { format: "bullet", order: "original", splitMode: "line" });

        expect(result.ok && result.items).toHaveLength(3);
        expect(result.ok && result.counts.joined).toBe(0);
        expect(result.ok && result.counts.wrapWidth).toBeNull();
    });
});

describe("refusals and edge cases", () => {
    test("refuses a paste past the character ceiling", () => {
        expect(
            sortLines("x".repeat(MAX_SORT_INPUT_LENGTH + 1), DEFAULT_SORT_OPTIONS, SEED),
        ).toEqual({ ok: false, reason: "too_long" });
    });

    test("refuses a paste past the item ceiling", () => {
        const many = Array.from({ length: MAX_SORT_ITEMS + 1 }, () => "x").join("\n");

        expect(sortLines(many, { ...DEFAULT_SORT_OPTIONS, splitMode: "line" }, SEED)).toEqual({
            ok: false,
            reason: "too_many_items",
        });
    });

    test("refuses when the cleanup empties a paste that had something in it", () => {
        expect(run("- \n- \n-", { removeDuplicates: true })).toEqual({
            ok: false,
            reason: "empty_result",
        });
    });

    test("answers an empty box with an empty box rather than a complaint", () => {
        const result = run("");

        expect(result.ok && result.text).toBe("");
        expect(result.ok && result.counts.items).toBe(0);
    });

    test("says when the text was already in the order asked for", () => {
        const already = run("apple\nbanana");
        const not = run("banana\napple");

        expect(already.ok && already.unchanged).toBe(true);
        expect(not.ok && not.unchanged).toBe(false);
    });

    test("counts the physical lines of the paste, not the items", () => {
        const result = run("a\nb\nc", { splitMode: "paragraph" });

        expect(result.ok && result.counts).toMatchObject({ lines: 3, split: 1, items: 1 });
    });
});
