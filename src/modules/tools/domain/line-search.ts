import type { Token, TokenKind } from "./highlight";

/**
 * Find-in-text for a view that renders a document as rows — the folding JSON
 * viewer, which only ever has a screenful of them in the DOM, so the browser's
 * own find cannot see the rest.
 *
 * Matches are kept as columns on a line rather than offsets into the whole
 * text, because a row is what draws them and a fold is what hides them, and
 * both of those are counted in lines.
 */

/** A short field: one character over is a mistake, not a truncated document. */
export const MAX_LINE_SEARCH_QUERY_LENGTH = 200;

/**
 * Past this the scan stops and says so. A query of one space over an indented
 * document matches every line many times, and a hundred thousand highlights is
 * not an answer anybody can step through.
 */
export const MAX_LINE_SEARCH_MATCHES = 10_000;

export type LineMatch = {
    /** Zero-based line. */
    readonly line: number;
    /** Column of the first matched character. */
    readonly start: number;
    /** Column just past the last one. */
    readonly end: number;
};

export type LineSearchResult = {
    readonly matches: readonly LineMatch[];
    readonly truncated: boolean;
};

export type LineSearchOptions = {
    readonly caseSensitive: boolean;
};

const NO_MATCHES: LineSearchResult = { matches: [], truncated: false };

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Every non-overlapping occurrence of `query`, in reading order, the way a
 * browser's find counts them.
 *
 * The case-insensitive path is a regular expression rather than lowercasing
 * both sides: `"İ".toLowerCase()` is two code units, so a lowercased copy no
 * longer has the original's columns, and every match after one would land a
 * character to the right of the text it found.
 */
export function findLineMatches(
    lines: readonly string[],
    query: string,
    { caseSensitive }: LineSearchOptions,
): LineSearchResult {
    if (query.length === 0) {
        return NO_MATCHES;
    }

    const pattern = new RegExp(query.replace(REGEXP_SPECIALS, "\\$&"), caseSensitive ? "g" : "gi");
    const matches: LineMatch[] = [];

    for (let line = 0; line < lines.length; line += 1) {
        pattern.lastIndex = 0;

        for (let found = pattern.exec(lines[line]); found !== null;) {
            if (matches.length === MAX_LINE_SEARCH_MATCHES) {
                return { matches, truncated: true };
            }

            matches.push({ line, start: found.index, end: found.index + found[0].length });
            found = pattern.exec(lines[line]);
        }
    }

    return { matches, truncated: false };
}

/** The step from `current` in a direction, wrapping at either end. */
export function stepMatchIndex(
    current: number,
    count: number,
    direction: "next" | "previous",
): number {
    if (count === 0) {
        return 0;
    }

    return direction === "next" ? (current + 1) % count : (current - 1 + count) % count;
}

/** A highlighted range on one line, in that line's own columns. */
export type LineMark = {
    readonly start: number;
    readonly end: number;
    readonly active: boolean;
};

export type MarkedToken = {
    readonly kind: TokenKind;
    readonly text: string;
    /** `null` outside every match; `active` for the one the reader stepped to. */
    readonly mark: "match" | "active" | null;
};

/**
 * Cuts already-coloured tokens at match boundaries, so a match keeps the colour
 * of whatever it sits inside and only gains a background.
 *
 * `offset` is the column the tokens start at. A collapsed fold draws its last
 * line's tail as a separate run, and that run's first character is not column
 * zero of its line.
 */
export function markTokens(
    tokens: readonly Token[],
    offset: number,
    marks: readonly LineMark[],
): MarkedToken[] {
    const result: MarkedToken[] = [];
    let column = offset;

    for (const token of tokens) {
        const tokenEnd = column + token.text.length;
        let cursor = column;

        for (const mark of marks) {
            const from = Math.max(mark.start, cursor);
            const to = Math.min(mark.end, tokenEnd);

            if (from >= to) {
                continue;
            }

            if (from > cursor) {
                result.push(slice(token, column, cursor, from, null));
            }

            result.push(slice(token, column, from, to, mark.active ? "active" : "match"));
            cursor = to;
        }

        if (cursor < tokenEnd) {
            result.push(slice(token, column, cursor, tokenEnd, null));
        }

        column = tokenEnd;
    }

    return result;
}

function slice(
    token: Token,
    tokenStart: number,
    from: number,
    to: number,
    mark: MarkedToken["mark"],
): MarkedToken {
    return {
        kind: token.kind,
        text: token.text.slice(from - tokenStart, to - tokenStart),
        mark,
    };
}
