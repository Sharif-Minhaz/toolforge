import type { DiffCompareFlags, DiffPrecision, DiffSegment, InlineSegments } from "../types";
import { MAX_INLINE_CELLS } from "./constants";
import { comparisonKeys } from "./normalize";
import { diffSequences } from "./sequence";

/**
 * A whitespace run, a run of letters, digits and underscores, or one other
 * character on its own. Punctuation being its own token keeps a changed bracket
 * from dragging the identifier beside it into the highlight, and every token is
 * kept verbatim so the tokens re-join into exactly the line they came from.
 */
const WORD_TOKENS = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

export function splitTokens(text: string, precision: "word" | "char"): string[] {
    // Code points rather than UTF-16 units, so an emoji is one token instead of
    // two halves that could be highlighted apart from each other.
    return precision === "char" ? [...text] : (text.match(WORD_TOKENS) ?? []);
}

/** Adjacent runs of the same kind become one, so the markup stays shallow. */
function mergeSegments(segments: readonly DiffSegment[]): DiffSegment[] {
    const merged: DiffSegment[] = [];

    for (const segment of segments) {
        const last = merged[merged.length - 1];

        if (last && last.kind === segment.kind) {
            merged[merged.length - 1] = { kind: last.kind, text: last.text + segment.text };
        } else {
            merged.push(segment);
        }
    }

    return merged;
}

/**
 * What changed *inside* a pair of lines that both exist but differ. Returns
 * `null` when there is nothing to say — line precision, or a pair long enough
 * that the table would cost more than the highlight is worth — and the caller
 * then tints the whole line.
 *
 * The same ignore options apply here as to the lines themselves: with
 * `ignoreCase` on, a token that differs only in case is not a change, exactly
 * as a line that differs only in case is not one.
 */
export function inlineSegments(
    left: string,
    right: string,
    precision: DiffPrecision,
    flags: DiffCompareFlags,
    maxCells: number = MAX_INLINE_CELLS,
): InlineSegments | null {
    if (precision === "line") {
        return null;
    }

    const leftTokens = splitTokens(left, precision);
    const rightTokens = splitTokens(right, precision);

    const diff = diffSequences(
        comparisonKeys(leftTokens, flags),
        comparisonKeys(rightTokens, flags),
        maxCells,
    );

    if (!diff.ok) {
        return null;
    }

    const leftParts: DiffSegment[] = [];
    const rightParts: DiffSegment[] = [];

    for (const op of diff.ops) {
        if (op.kind === "equal") {
            leftParts.push({ kind: "equal", text: leftTokens[op.leftIndex] });
            rightParts.push({ kind: "equal", text: rightTokens[op.rightIndex] });
        } else if (op.kind === "delete") {
            leftParts.push({ kind: "removed", text: leftTokens[op.leftIndex] });
        } else {
            rightParts.push({ kind: "added", text: rightTokens[op.rightIndex] });
        }
    }

    return { left: mergeSegments(leftParts), right: mergeSegments(rightParts) };
}
