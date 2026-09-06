/**
 * The Hex Editor's vocabulary.
 *
 * Every union here is a literal tuple rather than a bare string type, because
 * each one ends up inside a message key — `t(`columns.${column}`)` only
 * type-checks while `column` is a union.
 */

/** Which half of the grid the caret is typing into. */
export const HEX_COLUMNS = ["hex", "ascii"] as const;

export type HexColumn = (typeof HEX_COLUMNS)[number];

/** Byte order the inspector reads multi-byte values with. */
export const ENDIANNESS = ["little", "big"] as const;

export type Endianness = (typeof ENDIANNESS)[number];

/**
 * A byte range, held the way a caret actually behaves: `anchor` is where the
 * selection started and does not move, `focus` is where the caret is now and
 * moves with every arrow key. Either may be the larger of the two — a selection
 * dragged leftwards is not the same thing as one dragged rightwards, and
 * flipping them on the way in would lose which end the next Shift+Arrow grows.
 *
 * Both are byte offsets. `focus` is the caret position and may equal the
 * document length only when the document is empty; otherwise it indexes a byte.
 */
export type Selection = {
    readonly anchor: number;
    readonly focus: number;
};

/** A half-open byte range, `[start, end)`, which is what every reader wants. */
export type ByteRange = {
    readonly start: number;
    readonly end: number;
};

/** One rendered cell. The grid never holds a formatted string, only this. */
export type HexCellData = {
    readonly offset: number;
    readonly value: number;
};

export const CARET_MOVES = [
    "left",
    "right",
    "up",
    "down",
    "rowStart",
    "rowEnd",
    "pageUp",
    "pageDown",
    "documentStart",
    "documentEnd",
] as const;

export type CaretMove = (typeof CARET_MOVES)[number];

/**
 * One overwritten byte, kept as both halves so undo and redo are the same
 * operation read in opposite directions.
 */
export type ByteEdit = {
    readonly offset: number;
    readonly previous: number;
    readonly next: number;
};

/**
 * One undoable step, which is not always one byte.
 *
 * Typing a byte is a step of one; pressing Delete over a selected range is a
 * step of however many bytes were selected. Grouping them is what makes one
 * press of Ctrl+Z put back what one press of Delete took away — a stack of
 * single bytes would need four hundred presses to undo a four-hundred-byte
 * deletion, which is not an undo stack, it is a punishment.
 */
export type EditStep = readonly ByteEdit[];

/**
 * The undo stack. Immutable, so the store swaps a value rather than mutating
 * one — which is what lets a selector notice the change.
 */
export type EditHistory = {
    readonly past: readonly EditStep[];
    readonly future: readonly EditStep[];
};

/** What `computeRowWindow` hands the grid: which rows to build, and where. */
export type RowWindow = {
    /** First row index to render, inclusive. */
    readonly startRow: number;
    /** Last row index to render, exclusive. */
    readonly endRow: number;
    /** Height of the scrollable spacer, which is not always the true height. */
    readonly spacerHeight: number;
    /** Where the rendered block sits inside the spacer. */
    readonly offsetTop: number;
    /**
     * True when the document is taller than a browser will let one element be,
     * so scroll position is mapped to rows by ratio instead of by division. In
     * that mode one pixel of scrollbar is worth more than one row, and the
     * keyboard and Go To are how a reader lands on an exact offset.
     */
    readonly scaled: boolean;
};

export const SEARCH_MODES = ["ascii", "hex"] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];

export type SearchFailureReason =
    "empty_query" | "invalid_hex" | "odd_hex_length" | "not_single_byte" | "too_long";

export type SearchQueryResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly reason: SearchFailureReason };

export type SearchMatches = {
    readonly offsets: readonly number[];
    /** True when the scan stopped at `MAX_SEARCH_MATCHES` with more to find. */
    readonly truncated: boolean;
};

export type GoToFailureReason = "empty" | "not_a_number" | "out_of_range";

export type GoToResult =
    | { readonly ok: true; readonly offset: number }
    | { readonly ok: false; readonly reason: GoToFailureReason };

export type OpenFailureReason = "too_large" | "empty_file";

export type OpenFileResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly reason: OpenFailureReason };

/**
 * The rows of the data inspector, in the order they are shown.
 *
 * These are proper names — `UInt24`, `Float16`, `GUID` — so their labels are
 * data rather than copy and live beside this union in `domain/inspector.ts`.
 * Only the panel's heading is translated.
 */
export const INSPECTOR_KEYS = [
    "binary",
    "octal",
    "uint8",
    "int8",
    "uint16",
    "int16",
    "uint24",
    "int24",
    "uint32",
    "int32",
    "uint64",
    "int64",
    "float16",
    "float32",
    "float64",
    "ascii",
    "utf8",
    "utf16",
    "guid",
] as const;

export type InspectorKey = (typeof INSPECTOR_KEYS)[number];

/**
 * One inspector row. `value` is `null` when the document does not hold enough
 * bytes at the caret for that reading — the row stays visible and says so,
 * rather than disappearing and reflowing the panel on every keystroke.
 */
export type InspectorReading = {
    readonly key: InspectorKey;
    readonly label: string;
    readonly value: string | null;
    /** How many bytes the reading consumed, whether or not it succeeded. */
    readonly width: number;
};
