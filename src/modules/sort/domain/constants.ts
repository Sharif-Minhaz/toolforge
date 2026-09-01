import type { SortOptions, SortOrder } from "../types";

/**
 * Ceiling on one run. Sorting is a handful of linear passes plus one
 * comparison sort on the main thread; a hundred thousand characters is a small
 * book, far past anything anybody pastes into a list tool, and still inside a
 * frame.
 */
export const MAX_SORT_INPUT_LENGTH = 100_000;

/**
 * Ceiling on the items, checked separately from the characters. A hundred
 * thousand single-character lines is inside the length limit and is still fifty
 * thousand comparisons and fifty thousand React text nodes.
 */
export const MAX_SORT_ITEMS = 20_000;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/** A numbered list may start anywhere in this range. */
export const MIN_START_NUMBER = 0;
export const MAX_START_NUMBER = 9999;

export const START_NUMBER_PRESETS = [0, 1, 10, 100] as const;

/**
 * The three constants the wrap detector is built from.
 *
 * `smart` mode only folds a line into the one above it when the text genuinely
 * looks hard-wrapped, and "looks hard-wrapped" is this: at least
 * `SMART_MIN_WRAPPED_LINES` lines within `SMART_WRAP_TOLERANCE` characters of
 * the longest one, and that longest one at least `SMART_MIN_WRAP_WIDTH`
 * characters.
 *
 * The three together are what keeps a short list safe. `apple / banana /
 * cherry` has no line near forty characters, so no wrap column is found and
 * nothing is joined. One long line among short ones does not establish a column
 * either — a single long item followed by a short one is indistinguishable from
 * a wrapped line followed by its tail, so the conservative reading wins and
 * both stay separate items.
 */
export const SMART_MIN_WRAP_WIDTH = 40;
export const SMART_WRAP_TOLERANCE = 10;
export const SMART_MIN_WRAPPED_LINES = 2;

/**
 * Whether the order is one that compares items, and therefore has a sort key.
 * One predicate rather than a rule in the domain and a second one in the
 * options panel, so the two cannot drift apart.
 */
export function usesSortKey(order: SortOrder): boolean {
    return order === "ascending" || order === "descending";
}

/**
 * Whether anything in this run reads the case-sensitivity switch. Two things
 * do: a comparator that folds case, and the duplicate check. `codepoint` is
 * deliberately absent — comparing raw code points is what it means, and folding
 * case first would make it something else.
 */
export function usesCaseSensitivity(options: SortOptions): boolean {
    return (
        options.removeDuplicates || (usesSortKey(options.order) && options.sortKey !== "codepoint")
    );
}

/** Whether the order is drawn rather than derived, and so needs a seed. */
export function usesSeed(order: SortOrder): boolean {
    return order === "shuffle";
}

export const DEFAULT_SORT_OPTIONS: SortOptions = {
    // Smart is the default because the common paste is prose or a list copied
    // out of a PDF, a chat window or a mail client, all of which hard-wrap.
    // On text that does not look wrapped it behaves exactly like `line`.
    splitMode: "smart",
    order: "ascending",
    sortKey: "alphabetical",
    // Off, so `Zebra` and `apple` sort as a reader expects rather than putting
    // every capital first. The switch is there for the times that matters.
    caseSensitive: false,
    trim: true,
    removeEmpty: true,
    removeDuplicates: false,
    stripMarkers: true,
    format: "plain",
    bulletStyle: "dash",
    numberStyle: "decimal",
    startNumber: 1,
};
