import { describe, expect, test } from "bun:test";

import { findMatches } from "@/modules/regex/domain/execute";
import { parsePattern } from "@/modules/regex/domain/parse";
import { expandReplacement, listMatches, substituteAll } from "@/modules/regex/domain/replace";
import type { RegexMatch } from "@/modules/regex/types";

function matchesOf(pattern: string, flags: string, input: string): readonly RegexMatch[] {
    return findMatches(new RegExp(pattern, `d${flags}`), input, parsePattern(pattern).groups)
        .matches;
}

/** The engine's own answer, which is what the substitution pane claims to show. */
function nativeReplace(pattern: string, flags: string, input: string, replacement: string): string {
    return input.replace(new RegExp(pattern, flags), replacement);
}

describe("expandReplacement", () => {
    const cases: readonly {
        readonly name: string;
        readonly pattern: string;
        readonly input: string;
        readonly replacement: string;
    }[] = [
        { name: "whole match", pattern: "b+", input: "abbbc", replacement: "[$&]" },
        { name: "numbered group", pattern: "(a)(b)", input: "ab", replacement: "$2$1" },
        { name: "escaped dollar", pattern: "a", input: "a", replacement: "$$1" },
        { name: "prefix", pattern: "b", input: "abc", replacement: "<$`>" },
        { name: "suffix", pattern: "b", input: "abc", replacement: "<$'>" },
        { name: "named group", pattern: "(?<x>a)", input: "a", replacement: "[$<x>]" },
        { name: "unmatched group", pattern: "(a)|(b)", input: "b", replacement: "[$1][$2]" },
        { name: "group out of range", pattern: "(a)", input: "a", replacement: "$2" },
        { name: "two-digit group index", pattern: "(a)", input: "a", replacement: "$12" },
        { name: "dollar zero is literal", pattern: "a", input: "a", replacement: "$0" },
        { name: "trailing dollar", pattern: "a", input: "a", replacement: "x$" },
        { name: "no tokens at all", pattern: "a", input: "a", replacement: "plain" },
        { name: "angle without named groups", pattern: "(a)", input: "a", replacement: "$<x>" },
    ];

    // `String.replace` without `g` is exactly "expand this one match in place",
    // so the engine itself is the oracle for every token.
    for (const { name, pattern, input, replacement } of cases) {
        test(`${name} matches String.replace`, () => {
            expect(substituteAll(input, matchesOf(pattern, "", input), replacement)).toBe(
                nativeReplace(pattern, "", input, replacement),
            );
        });
    }

    test("$12 reaches group 12 when there is one", () => {
        const pattern = "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)";
        const [match] = matchesOf(pattern, "", "abcdefghijkl");

        expect(expandReplacement("$12", match, "abcdefghijkl")).toBe("l");
    });

    test("$12 is group 1 then a literal 2 when there is not", () => {
        const [match] = matchesOf("(a)", "", "a");

        expect(expandReplacement("$12", match, "a")).toBe("a2");
    });
});

describe("substituteAll", () => {
    const cases: readonly {
        readonly pattern: string;
        readonly flags: string;
        readonly input: string;
        readonly replacement: string;
    }[] = [
        { pattern: "a", flags: "g", input: "banana", replacement: "-" },
        { pattern: "a", flags: "", input: "banana", replacement: "-" },
        { pattern: "(\\w+)@(\\w+)", flags: "g", input: "x@y and p@q", replacement: "$2 at $1" },
        { pattern: "z", flags: "g", input: "abc", replacement: "!" },
        { pattern: "", flags: "g", input: "ab", replacement: "." },
        { pattern: "(?<n>\\d)", flags: "g", input: "a1b2", replacement: "[$<n>]" },
    ];

    for (const { pattern, flags, input, replacement } of cases) {
        test(`/${pattern}/${flags} on ${JSON.stringify(input)} matches String.replace`, () => {
            expect(substituteAll(input, matchesOf(pattern, flags, input), replacement)).toBe(
                nativeReplace(pattern, flags, input, replacement),
            );
        });
    }

    test("an empty match list leaves the input untouched", () => {
        expect(substituteAll("abc", [], "!")).toBe("abc");
    });
});

describe("listMatches", () => {
    test("one line per match, whole match by default", () => {
        const input = "a1 b2 c3";

        expect(listMatches(input, matchesOf("\\w\\d", "g", input), "")).toBe("a1\nb2\nc3");
    });

    test("expands the same tokens as a substitution", () => {
        const input = "2026-07 1999-12";
        const matches = matchesOf("(\\d{4})-(\\d{2})", "g", input);

        expect(listMatches(input, matches, "$2/$1")).toBe("07/2026\n12/1999");
    });

    test("no matches produces no lines", () => {
        expect(listMatches("abc", [], "$&")).toBe("");
    });
});
