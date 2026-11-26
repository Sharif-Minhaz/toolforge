import { z } from "zod";

import {
    DEFAULT_SQL_FORMAT_OPTIONS,
    MAX_SQL_INPUT_BYTES,
    MAX_SQL_NESTING_DEPTH,
} from "@/modules/sql-formatter/domain/constants";
import { effectiveOptions, formatSql } from "@/modules/sql-formatter/domain/format";
import {
    sqlDialectSchema,
    sqlIndentSchema,
    sqlKeywordCaseSchema,
    sqlQueryGapSchema,
} from "@/modules/sql-formatter/validation/format-options";

import { MAX_MCP_TEXT_LENGTH } from "../domain/constants";
import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Reformat SQL, and say where it stopped when it cannot.
 *
 * The keyword case the call actually ran with is returned, because ClickHouse
 * quietly keeps the case as written — its function names are case-sensitive —
 * and a caller that asked for upper case deserves to be told it did not get it.
 * The ceilings are stated in the refusal for the same reason: a model can split
 * a script it knows is too large, and cannot guess a limit it was never told.
 */
export const sqlFormatterFormatTool = defineMcpTool({
    toolId: "sql-formatter",
    verb: "format",
    title: "Format SQL",
    description:
        "Pretty-print SQL in one of 20 dialects — PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle PL/SQL, BigQuery, Snowflake, Redshift, DuckDB, ClickHouse, Spark, Trino and more. Changes only whitespace and, if asked, the case of keywords, data types and built-in functions; names, literals and comments are kept. Reports the line and column where a query stops parsing.",
    kind: "offline",
    inputSchema: z.object({
        sql: z.string().max(MAX_MCP_TEXT_LENGTH).describe("The query or script to format"),
        dialect: sqlDialectSchema
            .default(DEFAULT_SQL_FORMAT_OPTIONS.dialect)
            .describe("`sql` is standard SQL; pick the database's own dialect for its extensions"),
        keywordCase: sqlKeywordCaseSchema
            .default(DEFAULT_SQL_FORMAT_OPTIONS.keywordCase)
            .describe("`preserve` moves only whitespace. ClickHouse always preserves"),
        indent: sqlIndentSchema.default(DEFAULT_SQL_FORMAT_OPTIONS.indent),
        linesBetweenQueries: sqlQueryGapSchema
            .default(DEFAULT_SQL_FORMAT_OPTIONS.linesBetweenQueries)
            .describe("Blank lines between statements"),
    }),
    run: ({ sql, ...options }) => {
        const result = formatSql({ text: sql, options });

        if (!result.ok) {
            return refuseWithReason("SQL Formatter", result.reason, {
                inputBytes: result.inputBytes,
                maxInputBytes: MAX_SQL_INPUT_BYTES,
                maxNestingDepth: MAX_SQL_NESTING_DEPTH,
                line: result.line ?? null,
                column: result.column ?? null,
            });
        }

        return succeed(`Formatted ${result.inputBytes} bytes of ${options.dialect}`, {
            output: result.output,
            dialect: options.dialect,
            keywordCase: effectiveOptions(options).keywordCase,
            inputBytes: result.inputBytes,
            outputBytes: result.outputBytes,
        });
    },
});
