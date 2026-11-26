import type { SqlLanguage } from "sql-formatter";

/**
 * Every dialect the formatter knows, frozen as a literal list rather than read
 * from the package's `supportedDialects` at runtime — the picker has to render
 * the same options on both sides of hydration, and a message key can only be
 * built from a literal union. `tsql` is left out: it is the package's alias for
 * `transactsql`, and one database listed twice reads as two.
 *
 * A test holds this list against the installed package, so an upgrade that
 * adds or drops a dialect fails loudly instead of drifting.
 */
export const SQL_DIALECTS = [
    "sql",
    "bigquery",
    "clickhouse",
    "db2",
    "db2i",
    "duckdb",
    "hive",
    "mariadb",
    "mysql",
    "n1ql",
    "plsql",
    "postgresql",
    "redshift",
    "singlestoredb",
    "snowflake",
    "spark",
    "sqlite",
    "tidb",
    "transactsql",
    "trino",
] as const satisfies readonly SqlLanguage[];

export type SqlDialect = (typeof SQL_DIALECTS)[number];

export const SQL_KEYWORD_CASES = ["preserve", "upper", "lower"] as const;

export type SqlKeywordCase = (typeof SQL_KEYWORD_CASES)[number];

export const SQL_INDENTS = ["space2", "space4", "tab"] as const;

export type SqlIndent = (typeof SQL_INDENTS)[number];

/** Blank lines left between two statements. */
export const SQL_QUERY_GAPS = [0, 1, 2, 3] as const;

export type SqlQueryGap = (typeof SQL_QUERY_GAPS)[number];

export type SqlFormatOptions = {
    readonly dialect: SqlDialect;
    /** Applied to keywords, data types and built-in function names alike. */
    readonly keywordCase: SqlKeywordCase;
    readonly indent: SqlIndent;
    readonly linesBetweenQueries: SqlQueryGap;
};

/* --------------------------------------------------------------- failures --- */

export type SqlFormatFailureReason = "too_large" | "too_deep" | "unparseable";

export type SqlFormatFailure = {
    readonly ok: false;
    readonly reason: SqlFormatFailureReason;
    readonly inputBytes: number;
    /** 1-based, set only when the parser said where it stopped. */
    readonly line?: number;
    /** 1-based, in characters rather than UTF-16 units. */
    readonly column?: number;
};

export type SqlFormatSuccess = {
    readonly ok: true;
    readonly output: string;
    readonly inputBytes: number;
    readonly outputBytes: number;
};

export type SqlFormatResult = SqlFormatSuccess | SqlFormatFailure;

/* ----------------------------------------------------------------- export --- */

export type SqlExportRequest = {
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
