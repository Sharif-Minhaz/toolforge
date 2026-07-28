import { describe, expect, test } from "bun:test";

import { analyzeRegex } from "@/modules/regex/domain/analyze";
import { buildRegexExportFilename, createRegexExportFile } from "@/modules/regex/domain/export";
import type { RegexMode } from "@/modules/regex/types";

const GENERATED_AT = new Date("2026-07-28T10:15:00.000Z");

function exportOf(mode: RegexMode) {
    const analysis = analyzeRegex({
        pattern: "(\\w+)@(?<host>\\w+)",
        flags: ["global"],
        mode,
        replacement: "$2",
        testString: "ada@example bob@test",
    });

    return createRegexExportFile({
        mode,
        pattern: "(\\w+)@(?<host>\\w+)",
        flagLetters: "g",
        testString: "ada@example bob@test",
        analysis,
        generatedAt: GENERATED_AT,
    });
}

describe("buildRegexExportFilename", () => {
    test("is sortable and self-describing", () => {
        expect(buildRegexExportFilename("match", GENERATED_AT)).toBe(
            "regex-match-20260728T101500Z.json",
        );
    });

    test("names the mode it came from", () => {
        expect(buildRegexExportFilename("list", GENERATED_AT)).toContain("-list-");
    });
});

describe("createRegexExportFile", () => {
    test("declares JSON and ends with a newline", () => {
        const file = exportOf("match");

        expect(file.mimeType).toBe("application/json;charset=utf-8");
        expect(file.content.endsWith("\n")).toBe(true);
    });

    test("the content parses back as JSON", () => {
        expect(() => JSON.parse(exportOf("match").content)).not.toThrow();
    });

    test("carries every match with its capture groups", () => {
        const report = JSON.parse(exportOf("match").content);

        expect(report.matchCount).toBe(2);
        expect(report.matches[0].value).toBe("ada@example");
        expect(report.matches[0].captures).toEqual([
            { index: 1, name: null, value: "ada", start: 0, end: 3 },
            { index: 2, name: "host", value: "example", start: 4, end: 11 },
        ]);
    });

    test("carries the pattern and flags it was run with", () => {
        const report = JSON.parse(exportOf("match").content);

        expect(report.pattern).toBe("(\\w+)@(?<host>\\w+)");
        expect(report.flags).toBe("g");
        expect(report.generatedAt).toBe("2026-07-28T10:15:00.000Z");
    });

    test("includes the output only when there is one", () => {
        expect(JSON.parse(exportOf("match").content).output).toBeUndefined();
        expect(JSON.parse(exportOf("substitute").content).output).toBe("example test");
        expect(JSON.parse(exportOf("list").content).output).toBe("example\ntest");
    });

    test("an empty match set still exports", () => {
        const analysis = analyzeRegex({
            pattern: "zzz",
            flags: ["global"],
            mode: "match",
            replacement: "",
            testString: "abc",
        });
        const file = createRegexExportFile({
            mode: "match",
            pattern: "zzz",
            flagLetters: "g",
            testString: "abc",
            analysis,
            generatedAt: GENERATED_AT,
        });

        expect(JSON.parse(file.content)).toMatchObject({ matchCount: 0, matches: [] });
    });
});
