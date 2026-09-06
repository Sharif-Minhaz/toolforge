import { MAX_SEARCH_MATCHES, MAX_SEARCH_PATTERN_BYTES, MAX_SEARCH_QUERY_LENGTH } from "./constants";
import type { SearchMatches, SearchMode, SearchQueryResult } from "../types";

/**
 * Finding a run of bytes in a file.
 *
 * The two modes are two ways of writing the same needle, so both end at a
 * `Uint8Array` and only one scanner exists. ASCII is encoded a character at a
 * time rather than through `TextEncoder`: a search box is for bytes, and a
 * pasted `é` should be refused as out of range rather than quietly becoming the
 * two bytes UTF-8 would have made of it.
 */

export function parseSearchQuery(query: string, mode: SearchMode): SearchQueryResult {
    const trimmed = mode === "hex" ? query.trim() : query;

    if (trimmed.length === 0) {
        return { ok: false, reason: "empty_query" };
    }

    if (trimmed.length > MAX_SEARCH_QUERY_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const parsed = mode === "hex" ? parseHexQuery(trimmed) : parseAsciiQuery(trimmed);

    if (!parsed.ok) {
        return parsed;
    }

    if (parsed.bytes.length === 0) {
        return { ok: false, reason: "empty_query" };
    }

    if (parsed.bytes.length > MAX_SEARCH_PATTERN_BYTES) {
        return { ok: false, reason: "too_long" };
    }

    return parsed;
}

/**
 * `48 65 6C` and `48656C` are the same needle. Whitespace between pairs is how
 * a dump is pasted, so it is separators that are ignored — not stray digits,
 * which would silently shift every byte after them.
 */
function parseHexQuery(query: string): SearchQueryResult {
    const compact = query.replace(/[\s,]+/gu, "");

    if (!/^[0-9a-f]*$/iu.test(compact)) {
        return { ok: false, reason: "invalid_hex" };
    }

    // Its own reason rather than a general "invalid": half a byte is the one
    // mistake a reader makes while still typing, and "one digit short" is a
    // different sentence from "that is not hexadecimal".
    if (compact.length % 2 !== 0) {
        return { ok: false, reason: "odd_hex_length" };
    }

    const bytes = new Uint8Array(compact.length / 2);

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
    }

    return { ok: true, bytes };
}

/**
 * One byte per character, Latin-1 rather than strictly ASCII: `é` is the single
 * byte `E9` and is worth being able to type. Anything past U+00FF has no
 * single-byte reading at all, and encoding it as the two bytes UTF-8 would make
 * of it would find matches nobody asked for — so it is refused instead.
 */
function parseAsciiQuery(query: string): SearchQueryResult {
    const bytes = new Uint8Array(query.length);

    for (let index = 0; index < query.length; index += 1) {
        const code = query.charCodeAt(index);

        if (code > 0xff) {
            return { ok: false, reason: "not_single_byte" };
        }

        bytes[index] = code;
    }

    return { ok: true, bytes };
}

/**
 * Every offset the needle starts at, in order.
 *
 * The document is read through a function rather than passed in, so the scan
 * sees overwritten bytes without the caller having to materialise an edited copy
 * of a half-gigabyte file — and so the tests can search an array literal.
 *
 * The scan is the naive one, skipping on the first byte. A needle is at most 64
 * bytes and a mismatch almost always fails on the first comparison, so the
 * clever alternatives buy a preprocessing pass and a table to be wrong about.
 * What does bound the work is `MAX_SEARCH_MATCHES`: the scan stops once it has
 * collected that many and says it did, because ten million highlighted matches
 * is not a result anybody asked for.
 */
export function findMatches(
    readByte: (offset: number) => number,
    length: number,
    pattern: Uint8Array,
    limit = MAX_SEARCH_MATCHES,
): SearchMatches {
    const offsets: number[] = [];

    if (pattern.length === 0 || pattern.length > length) {
        return { offsets, truncated: false };
    }

    const first = pattern[0];
    const last = length - pattern.length;

    for (let start = 0; start <= last; start += 1) {
        if (readByte(start) !== first) {
            continue;
        }

        let index = 1;

        while (index < pattern.length && readByte(start + index) === pattern[index]) {
            index += 1;
        }

        if (index === pattern.length) {
            offsets.push(start);

            if (offsets.length >= limit) {
                return { offsets, truncated: start < last };
            }
        }
    }

    return { offsets, truncated: false };
}

/** The first match at or after `from`, wrapping to the top. `null` when none. */
export function nextMatch(offsets: readonly number[], from: number): number | null {
    if (offsets.length === 0) {
        return null;
    }

    return offsets.find((offset) => offset > from) ?? offsets[0];
}

/** The same backwards, wrapping to the bottom. */
export function previousMatch(offsets: readonly number[], from: number): number | null {
    if (offsets.length === 0) {
        return null;
    }

    return offsets.findLast((offset) => offset < from) ?? offsets[offsets.length - 1];
}

/** Which match the caret is sitting on, 1-based, or `0` when it is on none. */
export function matchIndexAt(offsets: readonly number[], offset: number): number {
    return offsets.indexOf(offset) + 1;
}

/**
 * Which of a row's sixteen bytes are inside a match, as a bitmask.
 *
 * A mask rather than an array because it is what a memoised row can be compared
 * on: an array allocated per row per frame is a new reference every time and
 * defeats the memo it was computed for. Bit 0 is the row's first byte.
 *
 * The scan starts from the last match that could still reach into the row,
 * which is what keeps this off the frame budget when a search has found a
 * thousand of them.
 */
export function rowMatchMask(
    offsets: readonly number[],
    patternLength: number,
    rowStart: number,
    bytesPerRow = 16,
): number {
    if (offsets.length === 0 || patternLength <= 0) {
        return 0;
    }

    const rowEnd = rowStart + bytesPerRow;
    let mask = 0;

    // Binary search for the first match that ends at or after the row's start.
    let low = 0;
    let high = offsets.length;

    while (low < high) {
        const middle = (low + high) >> 1;

        if (offsets[middle] + patternLength <= rowStart) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    for (let index = low; index < offsets.length && offsets[index] < rowEnd; index += 1) {
        const from = Math.max(offsets[index], rowStart);
        const to = Math.min(offsets[index] + patternLength, rowEnd);

        for (let offset = from; offset < to; offset += 1) {
            mask |= 1 << (offset - rowStart);
        }
    }

    return mask;
}
