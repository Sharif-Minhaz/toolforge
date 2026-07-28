import { describe, expect, test } from "bun:test";

import { MAX_PATTERN_LENGTH, MAX_TEST_STRING_LENGTH } from "@/modules/regex/domain/constants";
import {
    regexAnalysisRequestSchema,
    regexSearchParamsSchema,
} from "@/modules/regex/validation/regex-options";

function parseParams(params: Record<string, unknown>) {
    const result = regexSearchParamsSchema.safeParse(params);

    return result.success ? result.data : null;
}

describe("regexSearchParamsSchema", () => {
    test("reads a full link", () => {
        expect(
            parseParams({
                pattern: "\\d+",
                flags: "gm",
                mode: "list",
                delimiter: "tilde",
                replacement: "$&",
                test: "a1",
            }),
        ).toEqual({
            pattern: "\\d+",
            flags: ["global", "multiline"],
            mode: "list",
            delimiter: "tilde",
            replacement: "$&",
            test: "a1",
        });
    });

    test("an empty query is entirely optional", () => {
        expect(parseParams({})).toEqual({});
    });

    // One bad value must not cost the reader the rest of the link.
    describe("degrades field by field", () => {
        const cases: readonly [string, Record<string, unknown>][] = [
            ["unknown mode", { pattern: "a", mode: "explode" }],
            ["unknown delimiter", { pattern: "a", delimiter: "pipe" }],
            [
                "pattern past the ceiling",
                { pattern: "a".repeat(MAX_PATTERN_LENGTH + 1), mode: "list" },
            ],
            [
                "input past the ceiling",
                { pattern: "a", test: "x".repeat(MAX_TEST_STRING_LENGTH + 1) },
            ],
            ["array where a string belongs", { pattern: ["a", "b"], mode: "match" }],
        ];

        for (const [name, params] of cases) {
            test(name, () => {
                const parsed = parseParams(params);

                expect(parsed).not.toBeNull();
                expect(parsed?.pattern === undefined || typeof parsed.pattern === "string").toBe(
                    true,
                );
            });
        }
    });

    test("keeps the good half of a half-broken link", () => {
        expect(parseParams({ pattern: "\\w+", mode: "nonsense" })).toEqual({
            pattern: "\\w+",
            mode: undefined,
        });
    });

    test("unknown flag letters are dropped, not rejected", () => {
        expect(parseParams({ flags: "gQz" })?.flags).toEqual(["global"]);
        expect(parseParams({ flags: "" })?.flags).toEqual([]);
    });
});

describe("regexAnalysisRequestSchema", () => {
    test("accepts a well-formed request", () => {
        const parsed = regexAnalysisRequestSchema.parse({
            pattern: "a+",
            flags: ["global"],
            mode: "match",
            replacement: "",
            testString: "aaa",
        });

        expect(parsed.pattern).toBe("a+");
        expect(parsed.flags).toEqual(["global"]);
        expect(parsed.mode).toBe("match");
        expect(parsed.replacement).toBe("");
        expect(parsed.testString).toBe("aaa");
    });

    test("rejects an unknown flag", () => {
        expect(
            regexAnalysisRequestSchema.safeParse({
                pattern: "a",
                flags: ["turbo"],
                mode: "match",
                replacement: "",
                testString: "",
            }).success,
        ).toBe(false);
    });

    test("rejects an oversized pattern", () => {
        expect(
            regexAnalysisRequestSchema.safeParse({
                pattern: "a".repeat(MAX_PATTERN_LENGTH + 1),
                flags: [],
                mode: "match",
                replacement: "",
                testString: "",
            }).success,
        ).toBe(false);
    });
});
