import type { RegexMatch } from "../types";

/**
 * Splits the test string into painted and unpainted runs, so the highlight
 * layer can be rendered as a flat list of spans.
 *
 * Same contract as the pattern highlighter: the segments must concatenate back
 * into the original string, or the painted copy drifts out of line with the
 * textarea it sits behind.
 */
export type MatchSegment = {
    readonly start: number;
    readonly end: number;
    /** 0-based match ordinal, or `null` between matches. */
    readonly matchIndex: number | null;
};

export function toMatchSegments(
    length: number,
    matches: readonly RegexMatch[],
): readonly MatchSegment[] {
    const segments: MatchSegment[] = [];
    let cursor = 0;

    for (const [index, match] of matches.entries()) {
        // A zero-length match has nothing to paint, and an overlapping one
        // would double-render the same characters.
        if (match.end <= match.start || match.start < cursor) {
            continue;
        }

        if (match.start > cursor) {
            segments.push({ start: cursor, end: match.start, matchIndex: null });
        }

        segments.push({ start: match.start, end: match.end, matchIndex: index });
        cursor = match.end;
    }

    if (cursor < length) {
        segments.push({ start: cursor, end: length, matchIndex: null });
    }

    return segments;
}
