import type { SqlDialect, SqlFormatOptions, SqlIndent } from "../types";

export const DEFAULT_SQL_FORMAT_OPTIONS: SqlFormatOptions = {
    // The package's own default. Anything written to the standard parses here;
    // a dialect's extras — backtick names, `::` casts — need that dialect.
    dialect: "sql",
    // The package's default too, and the only setting that moves nothing but
    // whitespace. Recasing also catches a column named like a keyword —
    // `month`, `key` — which is harmless only where unquoted names ignore case.
    keywordCase: "preserve",
    indent: "space2",
    linesBetweenQueries: 1,
};

/**
 * Ceiling on one document.
 *
 * The formatter is an Earley parser and runs on the main thread. 64 KiB of
 * ordinary queries formats in about a quarter of a second on a desktop, which
 * is already the longest pause the debounced box should cost — and far more
 * SQL than anybody reads in one sitting.
 */
export const MAX_SQL_INPUT_BYTES = 65_536;

/**
 * Deepest run of open brackets accepted.
 *
 * The parser's cost grows with the square of expression nesting: 400 nested
 * `f(` calls take half a second and 800 take nearly two, so a two-kilobyte
 * shared link could hold a tab — or the MCP endpoint — for minutes. Real
 * queries nest a handful deep; 32 leaves a 64 KiB document of 32-deep
 * expressions at about a second and a half, the worst any input can cost.
 */
export const MAX_SQL_NESTING_DEPTH = 32;

/** Longest `?sql=` value accepted from a shared link. */
export const MAX_SHARED_SQL_LENGTH = 2048;

export const SQL_MIME_TYPE = "application/sql;charset=utf-8";

/**
 * Display names. Proper names are data, not copy — they read the same in
 * every locale — so only the generic dialect's label lives in the catalogue.
 */
export const SQL_DIALECT_NAMES: Record<Exclude<SqlDialect, "sql">, string> = {
    bigquery: "BigQuery",
    clickhouse: "ClickHouse",
    db2: "IBM Db2",
    db2i: "IBM Db2 for i",
    duckdb: "DuckDB",
    hive: "Apache Hive",
    mariadb: "MariaDB",
    mysql: "MySQL",
    n1ql: "Couchbase N1QL",
    plsql: "Oracle PL/SQL",
    postgresql: "PostgreSQL",
    redshift: "Amazon Redshift",
    singlestoredb: "SingleStore",
    snowflake: "Snowflake",
    spark: "Spark SQL",
    sqlite: "SQLite",
    tidb: "TiDB",
    transactsql: "SQL Server (T-SQL)",
    trino: "Trino / Presto",
};

export const INDENT_WIDTHS: Record<Exclude<SqlIndent, "tab">, number> = {
    space2: 2,
    space4: 4,
};
