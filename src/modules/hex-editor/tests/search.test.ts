import { describe, expect, test } from "bun:test";

import { MAX_SEARCH_PATTERN_BYTES } from "@/modules/hex-editor/domain/constants";
import {
    findMatches,
    matchIndexAt,
    nextMatch,
    parseSearchQuery,
    previousMatch,
    rowMatchMask,
} from "@/modules/hex-editor/domain/search";

function reader(values: readonly number[]) {
    return (offset: number) => values[offset] ?? 0;
}

describe("parseSearchQuery, ASCII", () => {
    test("takes one byte per character", () => {
        const result = parseSearchQuery("Hello", "ascii");

        expect(result.ok).toBe(true);
        expect(result.ok && [...result.bytes]).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    test("keeps significant whitespace, which is a byte like any other", () => {
        const result = parseSearchQuery("a b", "ascii");

        expect(result.ok && [...result.bytes]).toEqual([0x61, 0x20, 0x62]);
    });

    /** Latin-1, so a high byte can still be typed as the character it stands for. */
    test("takes a character between 0x80 and 0xFF as that byte", () => {
        const result = parseSearchQuery("café", "ascii");

        expect(result.ok && [...result.bytes]).toEqual([0x63, 0x61, 0x66, 0xe9]);
    });

    /**
     * A search box over bytes is not a text field: silently encoding an emoji as
     * the four bytes UTF-8 makes of it would find matches nobody typed.
     */
    test("refuses a character with no single-byte reading", () => {
        expect(parseSearchQuery("😀", "ascii")).toEqual({
            ok: false,
            reason: "not_single_byte",
        });
    });

    test("refuses an empty query by name", () => {
        expect(parseSearchQuery("", "ascii")).toEqual({ ok: false, reason: "empty_query" });
    });

    test("refuses a needle longer than the ceiling", () => {
        const long = "a".repeat(MAX_SEARCH_PATTERN_BYTES + 1);

        expect(parseSearchQuery(long, "ascii")).toEqual({ ok: false, reason: "too_long" });
    });
});

describe("parseSearchQuery, hex", () => {
    test("reads a spaced dump and a compact string the same way", () => {
        const spaced = parseSearchQuery("48 65 6C", "hex");
        const compact = parseSearchQuery("48656c", "hex");

        expect(spaced.ok && [...spaced.bytes]).toEqual([0x48, 0x65, 0x6c]);
        expect(compact.ok && [...compact.bytes]).toEqual([0x48, 0x65, 0x6c]);
    });

    test("accepts commas between bytes, which is how an array is pasted", () => {
        const result = parseSearchQuery("48,65,6C", "hex");

        expect(result.ok && [...result.bytes]).toEqual([0x48, 0x65, 0x6c]);
    });

    /** Half a byte is the mistake made while still typing, so it has its own name. */
    test("names an odd number of digits separately from bad ones", () => {
        expect(parseSearchQuery("48 6", "hex")).toEqual({ ok: false, reason: "odd_hex_length" });
        expect(parseSearchQuery("zz", "hex")).toEqual({ ok: false, reason: "invalid_hex" });
    });

    test("refuses whitespace on its own", () => {
        expect(parseSearchQuery("   ", "hex")).toEqual({ ok: false, reason: "empty_query" });
    });
});

describe("findMatches", () => {
    const HAYSTACK = [0x00, 0x48, 0x69, 0x00, 0x48, 0x69, 0x48, 0x69];

    test("finds every occurrence, in order", () => {
        const found = findMatches(reader(HAYSTACK), HAYSTACK.length, Uint8Array.from([0x48, 0x69]));

        expect(found.offsets).toEqual([1, 4, 6]);
        expect(found.truncated).toBe(false);
    });

    test("finds overlapping occurrences", () => {
        const values = [0xaa, 0xaa, 0xaa];
        const found = findMatches(reader(values), values.length, Uint8Array.from([0xaa, 0xaa]));

        expect(found.offsets).toEqual([0, 1]);
    });

    test("finds a match at the very end", () => {
        const found = findMatches(reader(HAYSTACK), HAYSTACK.length, Uint8Array.from([0x69]));

        expect(found.offsets.at(-1)).toBe(7);
    });

    test("finds nothing for a needle longer than the file", () => {
        expect(findMatches(reader([1]), 1, Uint8Array.from([1, 2])).offsets).toEqual([]);
    });

    test("finds nothing for an empty needle", () => {
        expect(findMatches(reader(HAYSTACK), HAYSTACK.length, new Uint8Array(0)).offsets).toEqual(
            [],
        );
    });

    /** Reading through a function is what lets the scan see overwritten bytes. */
    test("sees the bytes the reader reports, not the ones on disk", () => {
        const edited = [0x00, 0x00, 0x00];
        const read = (offset: number) => (offset === 1 ? 0xff : edited[offset]);
        const found = findMatches(read, edited.length, Uint8Array.from([0xff]));

        expect(found.offsets).toEqual([1]);
    });

    test("stops at the limit and says it did", () => {
        const values = new Array<number>(20).fill(0xaa);
        const found = findMatches(reader(values), values.length, Uint8Array.from([0xaa]), 5);

        expect(found.offsets).toHaveLength(5);
        expect(found.truncated).toBe(true);
    });

    test("does not claim truncation when the limit lands on the last match", () => {
        const values = [0xaa, 0x00, 0xaa];
        const found = findMatches(reader(values), values.length, Uint8Array.from([0xaa]), 2);

        expect(found.offsets).toEqual([0, 2]);
        expect(found.truncated).toBe(false);
    });
});

describe("navigating matches", () => {
    const OFFSETS = [4, 40, 400];

    test("next goes forward and wraps to the top", () => {
        expect(nextMatch(OFFSETS, 0)).toBe(4);
        expect(nextMatch(OFFSETS, 4)).toBe(40);
        expect(nextMatch(OFFSETS, 400)).toBe(4);
    });

    test("previous goes back and wraps to the bottom", () => {
        expect(previousMatch(OFFSETS, 400)).toBe(40);
        expect(previousMatch(OFFSETS, 4)).toBe(400);
        expect(previousMatch(OFFSETS, 0)).toBe(400);
    });

    test("both answer nothing when there is nothing to go to", () => {
        expect(nextMatch([], 0)).toBeNull();
        expect(previousMatch([], 0)).toBeNull();
    });

    test("numbers the match the caret is on, from one", () => {
        expect(matchIndexAt(OFFSETS, 40)).toBe(2);
        expect(matchIndexAt(OFFSETS, 41)).toBe(0);
    });
});

describe("rowMatchMask", () => {
    test("marks the bytes a match covers", () => {
        expect(rowMatchMask([2], 3, 0).toString(2)).toBe("11100");
    });

    test("marks nothing when no match reaches the row", () => {
        expect(rowMatchMask([100], 2, 0)).toBe(0);
        expect(rowMatchMask([], 2, 0)).toBe(0);
    });

    /** A needle straddling a row boundary is highlighted on both rows. */
    test("clips a match that starts before the row", () => {
        expect(rowMatchMask([14], 4, 16).toString(2)).toBe("11");
        expect(rowMatchMask([14], 4, 0).toString(2)).toBe("1100000000000000");
    });

    test("clips a match that runs past the end of the row", () => {
        expect(rowMatchMask([15], 4, 0)).toBe(1 << 15);
    });

    test("marks several matches on one row", () => {
        expect(rowMatchMask([0, 8], 2, 0).toString(2)).toBe("1100000011");
    });

    test("finds a match on a far row without walking the ones before it", () => {
        const offsets = Array.from({ length: 1000 }, (_, index) => index * 16);

        expect(rowMatchMask(offsets, 1, 500 * 16)).toBe(1);
    });

    test("marks nothing for an empty needle", () => {
        expect(rowMatchMask([0], 0, 0)).toBe(0);
    });
});
