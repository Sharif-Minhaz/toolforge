/** Which layout the comparison is shown in. Also the `view` search param. */
export const DIFF_VIEWS = ["split", "unified"] as const;

export type DiffView = (typeof DIFF_VIEWS)[number];

/**
 * How finely a changed pair of lines is compared. The outer comparison is
 * always line by line; this only decides what happens *inside* a line that
 * changed — nothing at `line`, token runs at `word`, code points at `char`.
 */
export const DIFF_PRECISIONS = ["line", "word", "char"] as const;

export type DiffPrecision = (typeof DIFF_PRECISIONS)[number];

/** Which box a value belongs to. Also builds `leftLabel` / `rightPlaceholder`. */
export const DIFF_SIDES = ["left", "right"] as const;

export type DiffSide = (typeof DIFF_SIDES)[number];

/** What two lines have to share to count as the same line. */
export type DiffCompareFlags = {
    readonly ignoreCase: boolean;
    /** Collapses whitespace runs and trims the ends before comparing. */
    readonly ignoreWhitespace: boolean;
};

export type DiffOptions = DiffCompareFlags & {
    readonly precision: DiffPrecision;
};

/**
 * Everything the workbench holds in one object, so the two settings that only
 * change the layout travel with the three that change the comparison. Kept in
 * one place because they are read together on every render.
 */
export type DiffWorkbenchOptions = DiffOptions & {
    readonly view: DiffView;
    readonly hideUnchanged: boolean;
};

/** One element of a diffed sequence, in output order. */
export type DiffOpKind = "equal" | "insert" | "delete";

export type SequenceOp = {
    readonly kind: DiffOpKind;
    /** Index into the left sequence; `-1` on an insert. */
    readonly leftIndex: number;
    /** Index into the right sequence; `-1` on a delete. */
    readonly rightIndex: number;
};

export type SequenceDiffResult =
    | { readonly ok: true; readonly ops: readonly SequenceOp[] }
    | { readonly ok: false; readonly reason: "too_large" };

export type DiffSegmentKind = "equal" | "added" | "removed";

/** A run of text inside one line, tinted by what happened to it. */
export type DiffSegment = {
    readonly kind: DiffSegmentKind;
    readonly text: string;
};

/** Both halves of an intra-line comparison, or `null` when it was not run. */
export type InlineSegments = {
    readonly left: readonly DiffSegment[];
    readonly right: readonly DiffSegment[];
};

export const DIFF_ROW_TYPES = ["equal", "insert", "delete", "replace"] as const;

export type DiffRowType = (typeof DIFF_ROW_TYPES)[number];

/**
 * One row of the side-by-side table. A `replace` carries both halves; an
 * `insert` or a `delete` carries only the side it exists on.
 */
export type DiffRow = {
    readonly type: DiffRowType;
    /** 1-based line number on the left, `null` when the row is an insert. */
    readonly leftNumber: number | null;
    readonly rightNumber: number | null;
    readonly left: string | null;
    readonly right: string | null;
    /** Set only on a `replace` row that was compared at word or char precision. */
    readonly segments: InlineSegments | null;
    /**
     * True on an `equal` row whose two sides are not byte-for-byte the same —
     * they matched only because an ignore option was on. Surfaced rather than
     * hidden, so a setting never silently swallows a change.
     */
    readonly ignoredDifference: boolean;
};

/** A row list with runs of unchanged rows folded into gap markers. */
export type CollapsedEntry<T> =
    { readonly kind: "item"; readonly item: T } | { readonly kind: "gap"; readonly hidden: number };

/** One printed line of the unified view — removals before additions. */
export type UnifiedLineKind = "equal" | "add" | "remove";

export type UnifiedLine = {
    readonly kind: UnifiedLineKind;
    readonly leftNumber: number | null;
    readonly rightNumber: number | null;
    readonly text: string;
    readonly segments: readonly DiffSegment[] | null;
    readonly ignoredDifference: boolean;
};

export type DiffStats = {
    /** Lines that exist only on the right. */
    readonly added: number;
    /** Lines that exist only on the left. */
    readonly removed: number;
    /** Lines present on both sides with different content. */
    readonly changed: number;
    readonly unchanged: number;
    /** Unchanged rows that matched only because of an ignore option. */
    readonly ignoredMatches: number;
};

export type DiffFailureReason = "empty" | "too_long" | "too_many_lines" | "too_large";

export type DiffFailure = {
    readonly ok: false;
    readonly reason: DiffFailureReason;
};

export type DiffSuccess = {
    readonly ok: true;
    readonly rows: readonly DiffRow[];
    readonly stats: DiffStats;
    /** True when nothing differs *under the active options*. */
    readonly identical: boolean;
};

export type DiffResult = DiffSuccess | DiffFailure;

export type DiffExportRequest = {
    readonly rows: readonly DiffRow[];
    readonly generatedAt: Date;
};
