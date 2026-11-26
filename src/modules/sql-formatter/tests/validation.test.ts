import { describe, expect, test } from "bun:test";

import { MAX_SHARED_SQL_LENGTH } from "@/modules/sql-formatter/domain/constants";
import { sqlFormatterSearchParamsSchema } from "@/modules/sql-formatter/validation/format-options";

function parse(params: Record<string, unknown>) {
    const result = sqlFormatterSearchParamsSchema.safeParse(params);

    if (!result.success) {
        throw new Error("the search-param schema must never reject; it degrades instead");
    }

    return result.data;
}

describe("shared links", () => {
    test("carries every option a link is allowed to name", () => {
        expect(
            parse({
                sql: "select 1",
                dialect: "postgresql",
                keywordCase: "upper",
                indent: "tab",
                lines: "2",
            }),
        ).toEqual({
            sql: "select 1",
            dialect: "postgresql",
            keywordCase: "upper",
            indent: "tab",
            lines: 2,
        });
    });

    test("each malformed field degrades on its own", () => {
        expect(
            parse({
                sql: "x".repeat(MAX_SHARED_SQL_LENGTH + 1),
                dialect: "oracle",
                keywordCase: "title",
                indent: "8",
                lines: "9",
            }),
        ).toEqual({
            sql: undefined,
            dialect: undefined,
            keywordCase: undefined,
            indent: undefined,
            lines: undefined,
        });
        expect(parse({ dialect: "sqlite", lines: "one" })).toMatchObject({
            dialect: "sqlite",
            lines: undefined,
        });
    });

    test("the alias the package accepts is not a dialect of its own here", () => {
        expect(parse({ dialect: "tsql" }).dialect).toBeUndefined();
    });
});
