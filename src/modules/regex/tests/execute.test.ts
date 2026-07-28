import { describe, expect, test } from "bun:test";

import { findMatches } from "@/modules/regex/domain/execute";
import { parsePattern } from "@/modules/regex/domain/parse";
import type { RegexGroupInfo } from "@/modules/regex/types";

function groupsOf(pattern: string): readonly RegexGroupInfo[] {
    return parsePattern(pattern).groups;
}

function run(pattern: string, flags: string, input: string) {
    return findMatches(new RegExp(pattern, `d${flags}`), input, groupsOf(pattern));
}

describe("findMatches", () => {
    test("without g it reports the first match only", () => {
        const { matches } = run("a", "", "aaa");

        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ start: 0, end: 1, value: "a" });
    });

    test("with g it walks the whole input", () => {
        const { matches } = run("a", "g", "aXaXa");

        expect(matches.map((match) => match.start)).toEqual([0, 2, 4]);
    });

    test("reports capture positions and values", () => {
        const { matches } = run("(\\d{4})-(\\d{2})", "g", "on 2026-07 and 1999-12");

        expect(matches).toHaveLength(2);
        expect(matches[0].captures).toEqual([
            { index: 1, name: null, value: "2026", start: 3, end: 7 },
            { index: 2, name: null, value: "07", start: 8, end: 10 },
        ]);
    });

    test("names captures from the parsed pattern", () => {
        const { matches } = run("(?<year>\\d{4})", "g", "2026");

        expect(matches[0].captures[0]).toMatchObject({ index: 1, name: "year", value: "2026" });
    });

    // A group that took no part is not the same as one that matched nothing;
    // conflating them makes `$1` insert the wrong thing.
    test("a group that did not participate reports null, not an empty string", () => {
        const { matches } = run("(a)|(b)", "g", "b");

        expect(matches[0].captures[0]).toMatchObject({ value: null, start: null, end: null });
        expect(matches[0].captures[1]).toMatchObject({ value: "b", start: 0, end: 1 });
    });

    test("a group that matched the empty string reports an empty string", () => {
        const { matches } = run("(a*)b", "g", "b");

        expect(matches[0].captures[0].value).toBe("");
    });

    test("a zero-length global match does not spin forever", () => {
        const { matches } = run("", "g", "abc");

        expect(matches.map((match) => match.start)).toEqual([0, 1, 2, 3]);
    });

    test("a zero-length match under u steps a whole code point", () => {
        const { matches } = run("(?:)", "gu", "😀a");

        expect(matches.map((match) => match.start)).toEqual([0, 2, 3]);
    });

    test("stops at the match cap and says so", () => {
        const result = findMatches(/a/dg, "a".repeat(50), [], {
            maxMatches: 10,
            timeBudgetMs: 1_000,
        });

        expect(result.matches).toHaveLength(10);
        expect(result.truncated).toBe(true);
        expect(result.timedOut).toBe(false);
    });

    // Driving the clock rather than waiting for a real one: the budget is
    // consulted in batches, so the fake has to advance across a whole batch.
    test("gives up when the time budget is spent", () => {
        let ticks = 0;
        const result = findMatches(
            /a/dg,
            "a".repeat(5_000),
            [],
            { maxMatches: 10_000, timeBudgetMs: 50 },
            () => {
                ticks += 1;

                return ticks === 1 ? 0 : 10_000;
            },
        );

        expect(result.timedOut).toBe(true);
        expect(result.truncated).toBe(false);
        expect(result.matches.length).toBeLessThan(5_000);
    });

    test("a sticky pattern stops at the first gap", () => {
        const { matches } = run("a", "y", "aab");

        expect(matches).toHaveLength(2);
    });

    test("no match yields an empty list rather than a failure", () => {
        const result = run("z", "g", "abc");

        expect(result.matches).toEqual([]);
        expect(result.truncated).toBe(false);
        expect(result.timedOut).toBe(false);
    });

    test("reports a duration from the injected clock", () => {
        const result = findMatches(
            /a/d,
            "a",
            [],
            { maxMatches: 10, timeBudgetMs: 10 },
            (() => {
                let call = 0;

                return () => (call++ === 0 ? 100 : 137.5);
            })(),
        );

        expect(result.durationMs).toBe(37.5);
    });
});
