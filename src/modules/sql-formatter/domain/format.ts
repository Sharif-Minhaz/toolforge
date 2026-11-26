import { format, type FormatOptionsWithLanguage } from "sql-formatter";

import { getByteLength } from "@/modules/tools/domain/byte-size";
import type { SqlDialect, SqlFormatOptions, SqlFormatResult } from "../types";
import { INDENT_WIDTHS, MAX_SQL_INPUT_BYTES, MAX_SQL_NESTING_DEPTH } from "./constants";

export type SqlFormatRequest = {
    readonly text: string;
    readonly options: SqlFormatOptions;
};

const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);

/**
 * The deepest run of open brackets anywhere in the text.
 *
 * shortcut: brackets inside string literals and comments count too. Real SQL
 * never holds 32 unbalanced brackets in a literal, so an overcount only ever
 * refuses input that was already absurd; tokenize first if that changes.
 */
export function measureNestingDepth(text: string): number {
    let depth = 0;
    let deepest = 0;

    for (const character of text) {
        if (OPENERS.has(character)) {
            depth += 1;
            deepest = Math.max(deepest, depth);
        } else if (CLOSERS.has(character)) {
            depth = Math.max(0, depth - 1);
        }
    }

    return deepest;
}

/**
 * Whether recasing keywords is safe in this dialect at all.
 *
 * ClickHouse is the one where it is not: its function names are
 * case-sensitive, so `toDateTime` upper-cased is `TODATETIME`, which does not
 * exist — and the formatter's ClickHouse keyword list catches table names such
 * as `events` as well. Output there keeps the case it was written in.
 */
export function supportsKeywordCase(dialect: SqlDialect): boolean {
    return dialect !== "clickhouse";
}

/** The options a request actually runs with, after the dialect has its say. */
export function effectiveOptions(options: SqlFormatOptions): SqlFormatOptions {
    return supportsKeywordCase(options.dialect) ? options : { ...options, keywordCase: "preserve" };
}

function toPackageOptions(options: SqlFormatOptions): FormatOptionsWithLanguage {
    return {
        language: options.dialect,
        // One reader-facing setting, three package settings: a data type and a
        // built-in function are keywords to anybody reading the query, and
        // `SELECT count(*)` under "upper" reads as a bug. Identifier case is
        // never asked for — a quoted name's case can be part of its meaning.
        keywordCase: options.keywordCase,
        dataTypeCase: options.keywordCase,
        functionCase: options.keywordCase,
        useTabs: options.indent === "tab",
        tabWidth: options.indent === "tab" ? 2 : INDENT_WIDTHS[options.indent],
        linesBetweenQueries: options.linesBetweenQueries,
    };
}

type TextPosition = { readonly line: number; readonly column: number };

/** 1-based line and column of a UTF-16 offset, the column counted in characters. */
function positionAt(text: string, offset: number): TextPosition {
    const lines = text.slice(0, offset).split("\n");

    return { line: lines.length, column: [...(lines.at(-1) ?? "")].length + 1 };
}

/** The parser's own failures carry the token it stopped at; the lexer's do not. */
function readTokenOffset(caught: Error): number | null {
    if (!("token" in caught) || typeof caught.token !== "object" || caught.token === null) {
        return null;
    }

    return "start" in caught.token && typeof caught.token.start === "number"
        ? caught.token.start
        : null;
}

// The lexer quotes at most ten characters before this, too few to hold a false
// match, and the closing quote breaks any match that would straddle it.
const LEXER_POSITION = /at line (\d+) column (\d+)/;

/**
 * Where the package stopped, and nothing else from what it said.
 *
 * The message never reaches the reader: it is English, it names grammar rules,
 * and it runs to thousands of characters. The package counts columns in UTF-16
 * units, so the column is recounted in characters — an emoji earlier on the
 * line would otherwise push it one place to the right.
 */
export function readErrorPosition(caught: Error, text: string): TextPosition | null {
    const tokenOffset = readTokenOffset(caught);

    if (tokenOffset !== null) {
        return positionAt(text, tokenOffset);
    }

    const match = LEXER_POSITION.exec(caught.message);

    if (match === null) {
        return null;
    }

    const line = Number(match[1]);
    const lineStart = text
        .split("\n")
        .slice(0, line - 1)
        .reduce((offset, previous) => offset + previous.length + 1, 0);

    return positionAt(text, lineStart + Number(match[2]) - 1);
}

/**
 * The one formatting pass the whole tool runs, shared by the server-rendered
 * first pass, every settled keystroke afterwards, and the MCP adapter.
 *
 * Pure and deterministic. Only whitespace and the case of keywords change;
 * the cross-check recorded in `tests/corpus.ts` held the output's parse tree
 * equal to the input's.
 */
export function formatSql({ text, options }: SqlFormatRequest): SqlFormatResult {
    const inputBytes = getByteLength(text);

    if (inputBytes > MAX_SQL_INPUT_BYTES) {
        return { ok: false, reason: "too_large", inputBytes };
    }

    if (measureNestingDepth(text) > MAX_SQL_NESTING_DEPTH) {
        return { ok: false, reason: "too_deep", inputBytes };
    }

    try {
        const output = format(text, toPackageOptions(effectiveOptions(options)));

        return { ok: true, output, inputBytes, outputBytes: getByteLength(output) };
    } catch (caught) {
        // Every refusal the package makes about the input starts this way;
        // anything else is a defect, and swallowing it would hide one.
        if (!(caught instanceof Error) || !caught.message.startsWith("Parse error")) {
            throw caught;
        }

        const position = readErrorPosition(caught, text);

        return { ok: false, reason: "unparseable", inputBytes, ...position };
    }
}
