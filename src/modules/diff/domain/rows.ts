import type {
    CollapsedEntry,
    DiffCompareFlags,
    DiffPrecision,
    DiffRow,
    DiffStats,
    SequenceOp,
    UnifiedLine,
} from "../types";
import { inlineSegments } from "./inline";

export type BuildRowsRequest = {
    readonly leftLines: readonly string[];
    readonly rightLines: readonly string[];
    readonly ops: readonly SequenceOp[];
    readonly precision: DiffPrecision;
    readonly flags: DiffCompareFlags;
};

/**
 * Turns the flat edit script into the rows a side-by-side table renders.
 *
 * A run of deletions immediately followed by a run of insertions is the same
 * block rewritten, so the two runs are zipped into `replace` rows: what is left
 * over on either side stays a plain insert or delete. Pairing is what makes an
 * intra-line highlight possible at all — there is no "before" to compare a
 * lone insertion against.
 */
export function buildRows({
    leftLines,
    rightLines,
    ops,
    precision,
    flags,
}: BuildRowsRequest): DiffRow[] {
    const rows: DiffRow[] = [];
    let deletions: number[] = [];
    let insertions: number[] = [];

    function flush() {
        const paired = Math.min(deletions.length, insertions.length);

        for (let index = 0; index < paired; index += 1) {
            const leftIndex = deletions[index];
            const rightIndex = insertions[index];
            const left = leftLines[leftIndex];
            const right = rightLines[rightIndex];

            rows.push({
                type: "replace",
                leftNumber: leftIndex + 1,
                rightNumber: rightIndex + 1,
                left,
                right,
                segments: inlineSegments(left, right, precision, flags),
                ignoredDifference: false,
            });
        }

        for (let index = paired; index < deletions.length; index += 1) {
            const leftIndex = deletions[index];

            rows.push({
                type: "delete",
                leftNumber: leftIndex + 1,
                rightNumber: null,
                left: leftLines[leftIndex],
                right: null,
                segments: null,
                ignoredDifference: false,
            });
        }

        for (let index = paired; index < insertions.length; index += 1) {
            const rightIndex = insertions[index];

            rows.push({
                type: "insert",
                leftNumber: null,
                rightNumber: rightIndex + 1,
                left: null,
                right: rightLines[rightIndex],
                segments: null,
                ignoredDifference: false,
            });
        }

        deletions = [];
        insertions = [];
    }

    for (const op of ops) {
        if (op.kind === "delete") {
            deletions.push(op.leftIndex);

            continue;
        }

        if (op.kind === "insert") {
            insertions.push(op.rightIndex);

            continue;
        }

        flush();

        const left = leftLines[op.leftIndex];
        const right = rightLines[op.rightIndex];

        rows.push({
            type: "equal",
            leftNumber: op.leftIndex + 1,
            rightNumber: op.rightIndex + 1,
            left,
            right,
            segments: null,
            // These two matched on their comparison keys, not their text. The
            // only reason they can still differ is an ignore option, and the
            // reader is told rather than left to wonder.
            ignoredDifference: left !== right,
        });
    }

    flush();

    return rows;
}

export function countStats(rows: readonly DiffRow[]): DiffStats {
    let added = 0;
    let removed = 0;
    let changed = 0;
    let unchanged = 0;
    let ignoredMatches = 0;

    for (const row of rows) {
        switch (row.type) {
            case "insert":
                added += 1;
                break;
            case "delete":
                removed += 1;
                break;
            case "replace":
                changed += 1;
                break;
            case "equal":
                unchanged += 1;

                if (row.ignoredDifference) {
                    ignoredMatches += 1;
                }

                break;
        }
    }

    return { added, removed, changed, unchanged, ignoredMatches };
}

export function isChangedRow(row: DiffRow): boolean {
    return row.type !== "equal";
}

/**
 * How many runs of adjacent changed items the list holds — one per place a
 * reader would point at and call "a change", which is what the step buttons
 * walk. Counting rows instead would make "next change" mean "next line".
 */
export function countChangeRuns<T>(items: readonly T[], isChange: (item: T) => boolean): number {
    let runs = 0;
    let inRun = false;

    for (const item of items) {
        if (!isChange(item)) {
            inRun = false;

            continue;
        }

        if (!inRun) {
            runs += 1;
        }

        inRun = true;
    }

    return runs;
}

/**
 * Which items survive folding: every change, plus `context` either side. The
 * same mask decides what the collapsed view shows and what a patch hunk holds,
 * so a downloaded patch always carries exactly the context that was on screen.
 */
export function contextMask<T>(
    items: readonly T[],
    isChange: (item: T) => boolean,
    context: number,
): boolean[] {
    const keep = new Array<boolean>(items.length).fill(false);

    items.forEach((item, index) => {
        if (!isChange(item)) {
            return;
        }

        const from = Math.max(0, index - context);
        const to = Math.min(items.length - 1, index + context);

        for (let cursor = from; cursor <= to; cursor += 1) {
            keep[cursor] = true;
        }
    });

    return keep;
}

/**
 * How many rows folding away the unchanged runs would actually hide. Zero means
 * the control has nothing to do, which is what the UI disables it on.
 */
export function countCollapsible<T>(
    items: readonly T[],
    isChange: (item: T) => boolean,
    context: number,
): number {
    return contextMask(items, isChange, context).filter((keep) => !keep).length;
}

/**
 * The same list with long unchanged runs replaced by a gap marker carrying how
 * many rows it stands for. Generic over the row type because the split view and
 * the unified view fold the same way over different shapes.
 */
export function collapseUnchanged<T>(
    items: readonly T[],
    isChange: (item: T) => boolean,
    context: number,
): CollapsedEntry<T>[] {
    const keep = contextMask(items, isChange, context);
    const entries: CollapsedEntry<T>[] = [];
    let hidden = 0;

    items.forEach((item, index) => {
        if (!keep[index]) {
            hidden += 1;

            return;
        }

        if (hidden > 0) {
            entries.push({ kind: "gap", hidden });
            hidden = 0;
        }

        entries.push({ kind: "item", item });
    });

    if (hidden > 0) {
        entries.push({ kind: "gap", hidden });
    }

    return entries;
}

/**
 * The list as entries the viewer can render, folded only when asked for. Not
 * the same as folding with an unlimited context: two identical texts have no
 * change to measure a context from, so an unlimited one would fold every row
 * away rather than leaving them all on screen.
 */
export function toDiffEntries<T>(
    items: readonly T[],
    isChange: (item: T) => boolean,
    context: number | null,
): CollapsedEntry<T>[] {
    return context === null
        ? items.map((item) => ({ kind: "item", item }))
        : collapseUnchanged(items, isChange, context);
}

/**
 * The same rows as one column, in patch order: within a rewritten block every
 * removal is printed before every addition, which is what `diff -u` emits and
 * what `git apply` expects. Rendering a `replace` row as `-`/`+`/`-`/`+` would
 * look fine and produce a patch nothing could read.
 */
export function toUnifiedLines(rows: readonly DiffRow[]): UnifiedLine[] {
    const lines: UnifiedLine[] = [];
    let removals: UnifiedLine[] = [];
    let additions: UnifiedLine[] = [];

    function flush() {
        for (const line of removals) {
            lines.push(line);
        }

        for (const line of additions) {
            lines.push(line);
        }

        removals = [];
        additions = [];
    }

    for (const row of rows) {
        if (row.type === "equal") {
            flush();

            lines.push({
                kind: "equal",
                leftNumber: row.leftNumber,
                rightNumber: row.rightNumber,
                // Context is printed from the original, the way a patch does.
                text: row.left ?? "",
                segments: null,
                ignoredDifference: row.ignoredDifference,
            });

            continue;
        }

        if (row.left !== null) {
            removals.push({
                kind: "remove",
                leftNumber: row.leftNumber,
                rightNumber: null,
                text: row.left,
                segments: row.segments?.left ?? null,
                ignoredDifference: false,
            });
        }

        if (row.right !== null) {
            additions.push({
                kind: "add",
                leftNumber: null,
                rightNumber: row.rightNumber,
                text: row.right,
                segments: row.segments?.right ?? null,
                ignoredDifference: false,
            });
        }
    }

    flush();

    return lines;
}

export function isChangedUnifiedLine(line: UnifiedLine): boolean {
    return line.kind !== "equal";
}
