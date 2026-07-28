import { describe, expect, test } from "bun:test";

import { analyzeRegex } from "@/modules/regex/domain/analyze";
import { toMatchSegments } from "@/modules/regex/domain/segments";
import type { RegexMatch } from "@/modules/regex/types";

function match(start: number, end: number, value = ""): RegexMatch {
    return { start, end, value, captures: [] };
}

function segmentsFor(pattern: string, input: string) {
    const analysis = analyzeRegex({
        pattern,
        flags: ["global"],
        mode: "match",
        replacement: "",
        testString: input,
    });

    return toMatchSegments(input.length, analysis.matches);
}

describe("toMatchSegments", () => {
    test("splits around a match", () => {
        expect(toMatchSegments(5, [match(1, 3)])).toEqual([
            { start: 0, end: 1, matchIndex: null },
            { start: 1, end: 3, matchIndex: 0 },
            { start: 3, end: 5, matchIndex: null },
        ]);
    });

    test("numbers matches in order", () => {
        const segments = toMatchSegments(6, [match(0, 2), match(4, 6)]);

        expect(segments.map((segment) => segment.matchIndex)).toEqual([0, null, 1]);
    });

    test("adjacent matches need no gap between them", () => {
        expect(toMatchSegments(4, [match(0, 2), match(2, 4)])).toEqual([
            { start: 0, end: 2, matchIndex: 0 },
            { start: 2, end: 4, matchIndex: 1 },
        ]);
    });

    test("no matches is one unpainted run", () => {
        expect(toMatchSegments(3, [])).toEqual([{ start: 0, end: 3, matchIndex: null }]);
    });

    test("an empty string produces nothing", () => {
        expect(toMatchSegments(0, [])).toEqual([]);
    });

    test("zero-length matches are skipped — there is nothing to paint", () => {
        expect(toMatchSegments(3, [match(0, 0), match(1, 1)])).toEqual([
            { start: 0, end: 3, matchIndex: null },
        ]);
    });

    // Same contract as the pattern highlighter: drift here means the painted
    // copy stops lining up with the textarea beneath it.
    test("the segments reassemble the input exactly", () => {
        const cases: readonly [string, string][] = [
            ["\\w+", "one two three"],
            ["^", "a\nb\nc"],
            ["", "abc"],
            ["a", "aaa"],
            ["\\n", "a\nb"],
            ["z", "abc"],
            ["😀", "x😀y"],
        ];

        for (const [pattern, input] of cases) {
            const rebuilt = segmentsFor(pattern, input)
                .map((segment) => input.slice(segment.start, segment.end))
                .join("");

            expect(rebuilt).toBe(input);
        }
    });
});
