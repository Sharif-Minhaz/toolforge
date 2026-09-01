import { describe, expect, test } from "bun:test";

import { buildComparator } from "@/modules/sort/domain/compare";

function sortedBy(
    items: readonly string[],
    key: Parameters<typeof buildComparator>[0],
    caseSensitive = false,
): string[] {
    return [...items].sort(buildComparator(key, caseSensitive));
}

describe("alphabetical", () => {
    test("puts a list in dictionary order, ignoring case by default", () => {
        expect(sortedBy(["banana", "Apple", "cherry"], "alphabetical")).toEqual([
            "Apple",
            "banana",
            "cherry",
        ]);
    });

    test("puts every capital first when case matters", () => {
        expect(sortedBy(["banana", "Apple", "Cherry"], "alphabetical", true)).toEqual([
            "Apple",
            "Cherry",
            "banana",
        ]);
    });

    /**
     * Two items that fold to the same string are still two items. Without the
     * code-point fallback they compare equal, and "equal" in a sort means
     * "whichever order they arrived in" — an order the controls cannot explain.
     */
    test("orders two items that differ only in case, rather than calling them equal", () => {
        expect(sortedBy(["apple", "Apple"], "alphabetical")).toEqual(["Apple", "apple"]);
        expect(sortedBy(["Apple", "apple"], "alphabetical")).toEqual(["Apple", "apple"]);
    });
});

describe("natural", () => {
    test("reads a run of digits as a number", () => {
        expect(sortedBy(["item10", "item2", "item1"], "natural")).toEqual([
            "item1",
            "item2",
            "item10",
        ]);
    });

    test("compares digit runs by length before content, so leading zeros do not lie", () => {
        expect(sortedBy(["v0009", "v10", "v0002"], "natural")).toEqual(["v0002", "v0009", "v10"]);
    });

    test("keeps counting past what a float can hold", () => {
        const huge = "id9007199254740993";
        const larger = "id9007199254740994";

        expect(sortedBy([larger, huge], "natural")).toEqual([huge, larger]);
    });

    test("falls back to letters where the digits match", () => {
        expect(sortedBy(["file3b", "file3a"], "natural")).toEqual(["file3a", "file3b"]);
    });
});

describe("codepoint", () => {
    test("orders by the raw code point, capitals and all", () => {
        expect(sortedBy(["banana", "Apple", "cherry"], "codepoint")).toEqual([
            "Apple",
            "banana",
            "cherry",
        ]);
        expect(sortedBy(["apple", "Banana"], "codepoint")).toEqual(["Banana", "apple"]);
    });

    test("compares by code point rather than by UTF-16 unit", () => {
        // U+1F600 is above the BMP; comparing UTF-16 units puts its surrogate
        // (0xD83D) below U+FFFD, which is the wrong answer.
        expect(sortedBy(["\u{1F600}", "�"], "codepoint")).toEqual(["�", "\u{1F600}"]);
    });

    test("ignores the case switch, that being what raw means", () => {
        expect(sortedBy(["b", "A"], "codepoint", true)).toEqual(["A", "b"]);
        expect(sortedBy(["b", "A"], "codepoint", false)).toEqual(["A", "b"]);
    });
});

describe("length", () => {
    test("orders short to long, counting code points", () => {
        expect(sortedBy(["three", "a", "seven!!"], "length")).toEqual(["a", "three", "seven!!"]);
        // One emoji is one character, not two UTF-16 units.
        expect(sortedBy(["\u{1F600}", "ab"], "length")).toEqual(["\u{1F600}", "ab"]);
    });

    test("breaks a tie alphabetically rather than leaving it to arrival order", () => {
        expect(sortedBy(["cat", "ant", "bee"], "length")).toEqual(["ant", "bee", "cat"]);
    });
});

/**
 * Cross-verification against ICU — see `docs/testing.md`.
 *
 * The comparators here are written out precisely so they do not depend on the
 * host's collation, so this asks the useful question instead: on the subset
 * where code-point order and dictionary order are the same thing — ASCII
 * letters and digits, no spaces, no punctuation, no accents — do we agree with
 * the platform's own collator? A disagreement there would be a bug in the
 * chunking or the fallback rather than a difference of opinion about language.
 *
 * Outside that subset the two deliberately part company, and the article says
 * so: `Zebra` before `apple` under a case-sensitive sort, and `ä` after `z`.
 */
describe("agreement with Intl.Collator over plain ASCII", () => {
    const WORDS = ["delta", "alpha", "charlie", "bravo", "echo", "foxtrot", "golf"];
    const NUMBERED = ["file1", "file10", "file2", "file20", "file3", "file100"];

    test("matches a base-sensitivity collator on words", () => {
        const collator = new Intl.Collator("en", { sensitivity: "base" });

        expect(sortedBy(WORDS, "alphabetical")).toEqual(
            [...WORDS].sort((a, b) => collator.compare(a, b)),
        );
    });

    test("matches a numeric collator on numbered names", () => {
        const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

        expect(sortedBy(NUMBERED, "natural")).toEqual(
            [...NUMBERED].sort((a, b) => collator.compare(a, b)),
        );
    });
});
