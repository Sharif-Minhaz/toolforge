import type { TextStats } from "@/modules/tools/types";

/**
 * How a paste is cut into items, which is the decision everything else here
 * depends on. Sorting and numbering are trivial once you know what a line is;
 * knowing what a line is, is the whole problem.
 */
export const SPLIT_MODES = ["line", "smart", "paragraph"] as const;

export type SplitMode = (typeof SPLIT_MODES)[number];

/**
 * What happens to the order of the items.
 *
 * `reverse` and `shuffle` are here rather than beside the sort keys on purpose:
 * neither one compares anything, so neither has a key to compare with. Asking
 * "which order" once, rather than "sort? and then which direction?", is what
 * keeps the sort key a single disable-with-a-reason control instead of two.
 */
export const SORT_ORDERS = ["original", "ascending", "descending", "reverse", "shuffle"] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * What "smaller" means, for the two orders that compare.
 *
 * None of them is `localeCompare` or `Intl.Collator`. Both read collation data
 * from the host — the browser's ICU on one side of hydration and the server's
 * on the other — so the same list could come back in two different orders and
 * React would have to reconcile a mismatch it cannot see the cause of. Every
 * comparator below is written out and deterministic instead.
 */
export const SORT_KEYS = ["alphabetical", "natural", "codepoint", "length"] as const;

export type SortKey = (typeof SORT_KEYS)[number];

/** How the finished items are written back out. */
export const LIST_FORMATS = ["plain", "bullet", "numbered"] as const;

export type ListFormat = (typeof LIST_FORMATS)[number];

export const BULLET_STYLES = ["dash", "asterisk", "bullet", "task"] as const;

export type BulletStyle = (typeof BULLET_STYLES)[number];

export const NUMBER_STYLES = ["decimal", "paren", "padded", "alpha", "roman"] as const;

export type NumberStyle = (typeof NUMBER_STYLES)[number];

export type SortOptions = {
    readonly splitMode: SplitMode;
    readonly order: SortOrder;
    /** Read only by `ascending` and `descending`; see `usesSortKey`. */
    readonly sortKey: SortKey;
    /**
     * Whether `A` and `a` are two different things. Read by the comparators
     * and by the duplicate check, and by nothing else — see
     * `usesCaseSensitivity`.
     */
    readonly caseSensitive: boolean;
    readonly trim: boolean;
    readonly removeEmpty: boolean;
    readonly removeDuplicates: boolean;
    /**
     * Drops a bullet or a number the items already carry, so re-listing a list
     * produces `1. item` rather than `1. - item`.
     */
    readonly stripMarkers: boolean;
    readonly format: ListFormat;
    readonly bulletStyle: BulletStyle;
    readonly numberStyle: NumberStyle;
    /** First ordinal of a numbered list. Ignored by the other two formats. */
    readonly startNumber: number;
};

export type SortFailureReason =
    | "too_long"
    | "too_many_items"
    /** Every item was cleaned away, from a paste that had something in it. */
    | "empty_result";

export type SortFailure = {
    readonly ok: false;
    readonly reason: SortFailureReason;
};

/** What the split did, so the reader can see the heuristic's decisions. */
export type SplitReport = {
    readonly items: readonly string[];
    /**
     * How many physical lines were folded into the line above them. Zero in
     * `line` mode by construction, and the number the status strip reports in
     * `smart` mode — a heuristic that never says what it did is a heuristic
     * nobody can trust.
     */
    readonly joined: number;
    /**
     * The wrap column `smart` mode settled on, or `null` when the text does not
     * look hard-wrapped and nothing was joined on length grounds.
     */
    readonly wrapWidth: number | null;
};

export type SortCounts = {
    /** Physical, newline-delimited lines in the paste. */
    readonly lines: number;
    /** Items after splitting, before any cleanup. */
    readonly split: number;
    readonly joined: number;
    /** The column `smart` mode settled on, or `null` when it found none. */
    readonly wrapWidth: number | null;
    readonly blanksRemoved: number;
    readonly duplicatesRemoved: number;
    /** Items in the answer. */
    readonly items: number;
};

export type SortSuccess = {
    readonly ok: true;
    readonly text: string;
    readonly items: readonly string[];
    readonly counts: SortCounts;
    readonly stats: TextStats;
    /** True when the output is character-for-character what went in. */
    readonly unchanged: boolean;
};

export type SortResult = SortSuccess | SortFailure;

export type SortExportRequest = {
    readonly content: string;
    /** Names the order in the filename, so two downloads are told apart. */
    readonly order: SortOrder;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
