import { describe, expect, test } from "bun:test";
import { supportedDialects } from "sql-formatter";

import {
    DEFAULT_SQL_FORMAT_OPTIONS,
    MAX_SQL_INPUT_BYTES,
    MAX_SQL_NESTING_DEPTH,
} from "@/modules/sql-formatter/domain/constants";
import {
    effectiveOptions,
    formatSql,
    measureNestingDepth,
    supportsKeywordCase,
} from "@/modules/sql-formatter/domain/format";
import { SQL_DIALECTS, type SqlFormatOptions } from "@/modules/sql-formatter/types";
import { PINNED_OUTPUTS, SQL_CORPUS } from "./corpus";

function run(text: string, overrides: Partial<SqlFormatOptions> = {}) {
    return formatSql({ text, options: { ...DEFAULT_SQL_FORMAT_OPTIONS, ...overrides } });
}

function nested(depth: number): string {
    return `SELECT ${"f(".repeat(depth)}1${")".repeat(depth)}`;
}

describe("dialects", () => {
    test("the frozen list is exactly what the installed package supports, alias aside", () => {
        const packaged = supportedDialects.filter((dialect) => dialect !== "tsql").sort();

        expect(packaged).toEqual([...SQL_DIALECTS].sort());
    });

    test("every dialect formats a plain query", () => {
        for (const dialect of SQL_DIALECTS) {
            expect(run("select a from t", { dialect }).ok).toBe(true);
        }
    });
});

describe("the cross-checked corpus", () => {
    for (const entry of SQL_CORPUS) {
        const pinned = PINNED_OUTPUTS[entry.name];

        test(entry.name, () => {
            expect(pinned).toBeDefined();
            expect(run(entry.sql, { dialect: entry.dialect })).toMatchObject({
                ok: true,
                output: pinned?.formatted,
            });
            expect(
                run(entry.sql, {
                    dialect: entry.dialect,
                    keywordCase: "upper",
                    indent: "tab",
                    linesBetweenQueries: 0,
                }),
            ).toMatchObject({ ok: true, output: pinned?.upperTabbed });
        });

        test(`${entry.name} is already formatted the second time`, () => {
            const once = run(entry.sql, { dialect: entry.dialect });
            const twice = once.ok ? run(once.output, { dialect: entry.dialect }) : once;

            expect(twice).toMatchObject({ ok: true, output: once.ok ? once.output : "" });
        });
    }
});

describe("options", () => {
    test("indent is two spaces, four spaces or a tab", () => {
        expect(run("select a from t", { indent: "space2" })).toMatchObject({
            output: "select\n  a\nfrom\n  t",
        });
        expect(run("select a from t", { indent: "space4" })).toMatchObject({
            output: "select\n    a\nfrom\n    t",
        });
        expect(run("select a from t", { indent: "tab" })).toMatchObject({
            output: "select\n\ta\nfrom\n\tt",
        });
    });

    test("blank lines between statements follow the setting", () => {
        expect(run("select 1; select 2", { linesBetweenQueries: 0 })).toMatchObject({
            output: "select\n  1;\nselect\n  2",
        });
        expect(run("select 1; select 2", { linesBetweenQueries: 2 })).toMatchObject({
            output: "select\n  1;\n\n\nselect\n  2",
        });
    });

    test("keyword case reaches data types and built-in functions, never names", () => {
        expect(
            run("select count(*), cast(a as varchar(10)) from Orders", { keywordCase: "upper" }),
        ).toMatchObject({
            output: "SELECT\n  COUNT(*),\n  CAST(a AS VARCHAR(10))\nFROM\n  Orders",
        });
        expect(run("SELECT Total FROM Orders", { keywordCase: "lower" })).toMatchObject({
            output: "select\n  Total\nfrom\n  Orders",
        });
    });

    test("ClickHouse keeps the case it was written in, because its functions are case-sensitive", () => {
        expect(supportsKeywordCase("clickhouse")).toBe(false);
        expect(
            effectiveOptions({
                ...DEFAULT_SQL_FORMAT_OPTIONS,
                dialect: "clickhouse",
                keywordCase: "upper",
            }).keywordCase,
        ).toBe("preserve");
        expect(
            run("select toDateTime(ts) from events", {
                dialect: "clickhouse",
                keywordCase: "upper",
            }),
        ).toMatchObject({ output: "select\n  toDateTime(ts)\nfrom\n  events" });
    });
});

describe("refusals", () => {
    test("empty and blank input are not failures", () => {
        expect(run("")).toEqual({ ok: true, output: "", inputBytes: 0, outputBytes: 0 });
        expect(run("  \n ")).toMatchObject({ ok: true, output: "" });
    });

    test("the ceiling is measured in UTF-8 bytes", () => {
        // "-- " and a final "x" are four bytes; every "é" is two.
        const atLimit = `-- ${"é".repeat((MAX_SQL_INPUT_BYTES - 4) / 2)}x`;

        expect(run(`${atLimit}x`)).toMatchObject({ ok: false, reason: "too_large" });
        expect(run(atLimit).ok).toBe(true);
    });

    test("nesting past the ceiling is refused before the parser sees it", () => {
        expect(run(nested(MAX_SQL_NESTING_DEPTH)).ok).toBe(true);
        expect(run(nested(MAX_SQL_NESTING_DEPTH + 1))).toMatchObject({
            ok: false,
            reason: "too_deep",
        });
    });

    test("a character the dialect cannot read is located by line and column", () => {
        expect(run("select 1;\nselect `a` from t", { dialect: "postgresql" })).toEqual({
            ok: false,
            reason: "unparseable",
            inputBytes: 27,
            line: 2,
            column: 8,
        });
    });

    test("a token the grammar cannot place is located too", () => {
        expect(run("select ) from t")).toMatchObject({ reason: "unparseable", line: 1, column: 8 });
        expect(run("select 1;\nselect (1 from t")).toMatchObject({
            reason: "unparseable",
            line: 2,
            column: 17,
        });
    });

    test("columns count characters, so an emoji earlier on the line does not shift them", () => {
        expect(run("select '😀', `x` from t", { dialect: "postgresql" })).toMatchObject({
            line: 1,
            column: 13,
        });
        expect(run("select '😀' ) from t")).toMatchObject({ line: 1, column: 12 });
    });
});

describe("nesting depth", () => {
    test("counts the deepest run of any bracket, and forgives a stray closer", () => {
        expect(measureNestingDepth("select 1")).toBe(0);
        expect(measureNestingDepth("f(a[1], {b: (2)})")).toBe(3);
        expect(measureNestingDepth(")) (")).toBe(1);
    });
});
