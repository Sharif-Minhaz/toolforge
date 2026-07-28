import { describe, expect, test } from "bun:test";

import { analyzeRegex } from "@/modules/regex/domain/analyze";
import {
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    MAX_TEST_STRING_LENGTH,
    SAMPLE_PATTERN,
    SAMPLE_TEST_STRING,
} from "@/modules/regex/domain/constants";
import type { RegexAnalysisRequest, RegexFlag, RegexMode } from "@/modules/regex/types";

function request(overrides: Partial<RegexAnalysisRequest> = {}): RegexAnalysisRequest {
    return {
        pattern: "a",
        flags: ["global"],
        mode: "match",
        replacement: "",
        testString: "aaa",
        ...overrides,
    };
}

function analyze(overrides: Partial<RegexAnalysisRequest> = {}) {
    return analyzeRegex(request(overrides));
}

describe("analyzeRegex", () => {
    test("the sample pattern matches the sample input", () => {
        const result = analyze({
            pattern: SAMPLE_PATTERN,
            testString: SAMPLE_TEST_STRING,
            flags: ["global", "multiline"],
        });

        expect(result.failure).toBeNull();
        expect(result.matches.map((match) => match.value)).toEqual([
            "ada@example.com",
            "grace.hopper@navy.mil",
            "katherine.johnson@nasa.gov",
        ]);
    });

    test("an empty pattern is idle, not an error", () => {
        const result = analyze({ pattern: "" });

        expect(result.failure).toBeNull();
        expect(result.matches).toEqual([]);
        expect(result.explanation).toEqual([]);
        expect(result.highlights).toEqual([]);
    });

    test("an empty input still explains and highlights the pattern", () => {
        const result = analyze({ testString: "" });

        expect(result.failure).toBeNull();
        expect(result.matches).toEqual([]);
        expect(result.explanation.length).toBeGreaterThan(0);
        expect(result.highlights.length).toBeGreaterThan(0);
    });

    // The whole reason `failure` sits beside the panels rather than replacing
    // them: a half-typed pattern should still be readable.
    test("an invalid pattern keeps its highlighting and explanation", () => {
        const result = analyze({ pattern: "(a" });

        expect(result.failure?.reason).toBe("invalid_pattern");
        expect(result.failure?.detail?.length).toBeGreaterThan(0);
        expect(result.highlights.length).toBeGreaterThan(0);
        expect(result.explanation.length).toBeGreaterThan(0);
    });

    test("an unsupported construct is named and located before compiling", () => {
        const result = analyze({ pattern: "x(?>a)" });

        expect(result.failure).toMatchObject({
            reason: "unsupported_construct",
            position: 2,
            detail: "(?>a)",
        });
    });

    test("reports the capture groups it found", () => {
        const result = analyze({ pattern: "(a)(?<n>b)", testString: "ab" });

        expect(result.groups).toEqual([
            { index: 1, name: null },
            { index: 2, name: "n" },
        ]);
    });

    test("passes the nested-quantifier warning through without blocking", () => {
        const result = analyze({ pattern: "(a+)+", testString: "aaa" });

        expect(result.failure).toBeNull();
        expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "nestedQuantifier",
        ]);
        expect(result.matches.length).toBeGreaterThan(0);
    });

    describe("flags reach the engine", () => {
        test("g finds every match", () => {
            expect(analyze({ pattern: "a", flags: [] }).matches).toHaveLength(1);
            expect(analyze({ pattern: "a", flags: ["global"] }).matches).toHaveLength(3);
        });

        test("i ignores case", () => {
            expect(analyze({ pattern: "A", testString: "a", flags: [] }).matches).toHaveLength(0);
            expect(
                analyze({ pattern: "A", testString: "a", flags: ["ignoreCase"] }).matches,
            ).toHaveLength(1);
        });

        test("m re-points the anchors", () => {
            const options = { pattern: "^b", testString: "a\nb", flags: [] as RegexFlag[] };

            expect(analyze(options).matches).toHaveLength(0);
            expect(analyze({ ...options, flags: ["multiline"] }).matches).toHaveLength(1);
        });

        test("s lets the dot cross a line break", () => {
            const options = { pattern: "a.b", testString: "a\nb", flags: [] as RegexFlag[] };

            expect(analyze(options).matches).toHaveLength(0);
            expect(analyze({ ...options, flags: ["dotAll"] }).matches).toHaveLength(1);
        });

        test("x makes whitespace and comments inert", () => {
            const result = analyze({
                pattern: "a b # note",
                testString: "ab",
                flags: ["extended"],
            });

            expect(result.compiledSource).toBe("ab");
            expect(result.matches).toHaveLength(1);
        });

        test("U inverts greed", () => {
            const options = {
                pattern: "<.+>",
                testString: "<a><b>",
                flags: [] as RegexFlag[],
            };

            expect(analyze(options).matches[0].value).toBe("<a><b>");
            expect(analyze({ ...options, flags: ["ungreedy"] }).matches[0].value).toBe("<a>");
        });
    });

    describe("modes", () => {
        test("match mode produces no output text", () => {
            expect(analyze({ mode: "match" }).output).toBe("");
        });

        test("substitute mode rewrites the whole input", () => {
            const result = analyze({
                mode: "substitute",
                pattern: "a",
                replacement: "-",
                testString: "banana",
            });

            expect(result.output).toBe("b-n-n-");
        });

        test("list mode gives one line per match", () => {
            const result = analyze({
                mode: "list",
                pattern: "\\w\\d",
                replacement: "",
                testString: "a1 b2",
            });

            expect(result.output).toBe("a1\nb2");
        });

        test("a failing pattern produces no output in any mode", () => {
            for (const mode of ["match", "substitute", "list"] as readonly RegexMode[]) {
                expect(analyze({ mode, pattern: "(", replacement: "x" }).output).toBe("");
            }
        });
    });

    describe("limits", () => {
        test("a pattern past the ceiling is not even parsed", () => {
            const result = analyze({ pattern: "a".repeat(MAX_PATTERN_LENGTH + 1) });

            expect(result.failure).toEqual({
                reason: "pattern_too_long",
                limit: MAX_PATTERN_LENGTH,
            });
            expect(result.explanation).toEqual([]);
        });

        test("an input past the ceiling still explains the pattern", () => {
            const result = analyze({ testString: "a".repeat(MAX_TEST_STRING_LENGTH + 1) });

            expect(result.failure?.reason).toBe("input_too_long");
            expect(result.matches).toEqual([]);
            expect(result.explanation.length).toBeGreaterThan(0);
        });

        test("a replacement past the ceiling is refused", () => {
            const result = analyze({
                mode: "substitute",
                replacement: "x".repeat(MAX_REPLACEMENT_LENGTH + 1),
            });

            expect(result.failure?.reason).toBe("replacement_too_long");
        });

        test("the match cap is reported rather than hidden", () => {
            const result = analyzeRegex(request({ pattern: "a", testString: "a".repeat(50) }), {
                limits: { maxMatches: 10, timeBudgetMs: 1_000 },
            });

            expect(result.matches).toHaveLength(10);
            expect(result.truncated).toBe(true);
        });

        // A run that gave up still shows what it found — those matches are the
        // evidence of what is slow.
        test("a timeout keeps the matches found so far", () => {
            let call = 0;
            const result = analyzeRegex(request({ pattern: "a", testString: "a".repeat(5_000) }), {
                limits: { maxMatches: 100_000, timeBudgetMs: 10 },
                clock: () => {
                    call += 1;

                    return call === 1 ? 0 : 5_000;
                },
            });

            expect(result.failure?.reason).toBe("timed_out");
            expect(result.matches.length).toBeGreaterThan(0);
        });
    });

    test("is deterministic — the same request gives the same result", () => {
        const twice = [analyze(), analyze()].map((result) => ({
            ...result,
            durationMs: 0,
        }));

        expect(twice[0]).toEqual(twice[1]);
    });

    test("never throws, whatever it is handed", () => {
        const patterns = ["(", "[", "a\\", "*", "(?<", "\\u{", "(?R)", "a++", "]", "a)b", ""];

        for (const pattern of patterns) {
            for (const mode of ["match", "substitute", "list"] as readonly RegexMode[]) {
                expect(() => analyze({ pattern, mode, replacement: "$1$<x>$&" })).not.toThrow();
            }
        }
    });
});
