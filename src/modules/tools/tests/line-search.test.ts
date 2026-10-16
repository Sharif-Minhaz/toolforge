import { describe, expect, test } from "bun:test";

import { highlight } from "@/modules/tools/domain/highlight";
import {
    findLineMatches,
    markTokens,
    MAX_LINE_SEARCH_MATCHES,
    stepMatchIndex,
} from "@/modules/tools/domain/line-search";

const LINES = ["{", '  "name": "Alice",', '  "alias": "ALICE alice"', "}"];

describe("findLineMatches", () => {
    test("finds every occurrence in reading order, ignoring case by default", () => {
        const { matches, truncated } = findLineMatches(LINES, "alice", { caseSensitive: false });

        expect(truncated).toBe(false);
        expect(matches).toEqual([
            { line: 1, start: 11, end: 16 },
            { line: 2, start: 12, end: 17 },
            { line: 2, start: 18, end: 23 },
        ]);
    });

    test("respects case when asked", () => {
        const { matches } = findLineMatches(LINES, "ALICE", { caseSensitive: true });

        expect(matches).toEqual([{ line: 2, start: 12, end: 17 }]);
    });

    test("treats the query as text, not as a pattern", () => {
        const { matches } = findLineMatches(['"a.b": "(x)"', "axb"], "a.b", {
            caseSensitive: false,
        });

        expect(matches).toEqual([{ line: 0, start: 1, end: 4 }]);
        expect(findLineMatches(['"(x)"'], "(x)", { caseSensitive: false }).matches).toHaveLength(1);
    });

    test("does not count overlapping occurrences twice", () => {
        expect(findLineMatches(["aaaa"], "aa", { caseSensitive: true }).matches).toEqual([
            { line: 0, start: 0, end: 2 },
            { line: 0, start: 2, end: 4 },
        ]);
    });

    test("keeps the original columns where lowercasing would change the length", () => {
        // "İ".toLowerCase() is two code units; a lowercased copy would shift
        // the match one column right.
        const { matches } = findLineMatches(['"İstanbul": "x"'], "x", { caseSensitive: false });

        expect(matches).toEqual([{ line: 0, start: 13, end: 14 }]);
    });

    test("finds nothing for an empty query", () => {
        expect(findLineMatches(LINES, "", { caseSensitive: false })).toEqual({
            matches: [],
            truncated: false,
        });
    });

    test("stops at the ceiling and says so", () => {
        const lines = Array.from({ length: MAX_LINE_SEARCH_MATCHES + 5 }, () => " ");
        const result = findLineMatches(lines, " ", { caseSensitive: false });

        expect(result.truncated).toBe(true);
        expect(result.matches).toHaveLength(MAX_LINE_SEARCH_MATCHES);
    });
});

describe("stepMatchIndex", () => {
    test("wraps at both ends", () => {
        expect(stepMatchIndex(2, 3, "next")).toBe(0);
        expect(stepMatchIndex(0, 3, "previous")).toBe(2);
        expect(stepMatchIndex(1, 3, "next")).toBe(2);
        expect(stepMatchIndex(0, 0, "next")).toBe(0);
    });
});

describe("markTokens", () => {
    const tokens = highlight('  "name": "Alice",', "json");

    test("leaves the text and colours untouched", () => {
        const marked = markTokens(tokens, 0, [{ start: 11, end: 16, active: true }]);

        expect(marked.map((token) => token.text).join("")).toBe('  "name": "Alice",');
        const value = tokens.find((token) => token.text.includes("Alice"));

        expect(marked.filter((token) => token.mark !== null)).toEqual([
            { kind: value?.kind ?? "plain", text: "Alice", mark: "active" },
        ]);
    });

    test("splits a match that spans several tokens", () => {
        const marked = markTokens(tokens, 0, [{ start: 3, end: 9, active: false }]);
        const matched = marked.filter((token) => token.mark === "match");

        expect(matched.map((token) => token.text).join("")).toBe('name":');
        expect(matched.length).toBeGreaterThan(1);
    });

    test("reads marks in the line's own columns when the run starts later", () => {
        const tail = highlight("},", "json");
        const marked = markTokens(tail, 2, [{ start: 3, end: 4, active: false }]);

        expect(marked).toEqual([
            { kind: tail[0].kind, text: "}", mark: null },
            { kind: marked[1].kind, text: ",", mark: "match" },
        ]);
    });

    test("returns the tokens unmarked when there are no marks", () => {
        expect(markTokens(tokens, 0, []).every((token) => token.mark === null)).toBe(true);
    });
});
