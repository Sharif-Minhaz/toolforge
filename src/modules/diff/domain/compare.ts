import { splitLines } from "@/modules/tools/domain/lines";
import type { DiffOptions, DiffResult } from "../types";
import { MAX_DIFF_CELLS, MAX_DIFF_INPUT_LENGTH, MAX_DIFF_LINES } from "./constants";
import { comparisonKeys } from "./normalize";
import { buildRows, countStats } from "./rows";
import { diffSequences } from "./sequence";

/**
 * An empty side has no lines at all. Splitting `""` would yield one empty line,
 * which then pairs with the first line of the other side and reports a change
 * that is really an absence.
 */
function toLines(text: string): string[] {
    return text.length === 0 ? [] : splitLines(text);
}

/**
 * The one comparison the page and the island both call. Pure and deterministic,
 * so the server-rendered pass already holds the result and hydration has
 * nothing to reconcile.
 */
export function compareTexts(left: string, right: string, options: DiffOptions): DiffResult {
    if (left.length === 0 && right.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (left.length > MAX_DIFF_INPUT_LENGTH || right.length > MAX_DIFF_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const leftLines = toLines(left);
    const rightLines = toLines(right);

    if (leftLines.length > MAX_DIFF_LINES || rightLines.length > MAX_DIFF_LINES) {
        return { ok: false, reason: "too_many_lines" };
    }

    const sequence = diffSequences(
        comparisonKeys(leftLines, options),
        comparisonKeys(rightLines, options),
        MAX_DIFF_CELLS,
    );

    if (!sequence.ok) {
        return { ok: false, reason: "too_large" };
    }

    const rows = buildRows({
        leftLines,
        rightLines,
        ops: sequence.ops,
        precision: options.precision,
        flags: options,
    });

    const stats = countStats(rows);

    return {
        ok: true,
        rows,
        stats,
        // Under the active options — two files that differ only in case are
        // identical here while `ignoreCase` is on, and `stats.ignoredMatches`
        // is what says so.
        identical: stats.added === 0 && stats.removed === 0 && stats.changed === 0,
    };
}
