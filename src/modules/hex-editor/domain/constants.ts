import type { Endianness, HexColumn, SearchMode } from "../types";

/** Sixteen bytes to a row, which is what every hex dump since `od` has used. */
export const BYTES_PER_ROW = 16;

/** Eight digits addresses 4 GiB, which is past anything a tab can hold open. */
export const OFFSET_DIGITS = 8;

/** One row's height in CSS pixels. Fixed, which is what makes windowing exact. */
export const ROW_HEIGHT = 22;

/** Rows built above and below the viewport, so a fast scroll never shows a gap. */
export const OVERSCAN_ROWS = 8;

/**
 * The largest file this will open — 512 MiB, read into one `ArrayBuffer`.
 *
 * The ceiling is memory, not addressing: the bytes are held whole so that
 * `getByte` stays a single array index, and a tab that tries to hold much more
 * than this is a tab that is about to be killed by the browser rather than by
 * us. Past it the open is refused by name, which is a far better answer than a
 * page that goes white halfway through reading.
 */
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

/**
 * How tall the scroll spacer is allowed to get.
 *
 * A browser silently clamps an element past roughly 33.5 million pixels, and a
 * clamped spacer means the last rows of the file are unreachable — the scrollbar
 * hits the bottom while the grid is still in the middle of the document. At 22
 * pixels a row that ceiling is passed by any file over about 24 MB, which is
 * well inside what this tool is for.
 *
 * So past this height the spacer stops growing and scroll position is mapped to
 * a row by ratio instead. The cost is that one notch of the wheel moves further
 * than one row; the keyboard and Go To still land on an exact offset, and the
 * status bar always says which one.
 */
export const MAX_SPACER_HEIGHT = 33_000_000;

/** How many matches a search collects before it stops looking. */
export const MAX_SEARCH_MATCHES = 1000;

/** The longest needle, in bytes. Long enough for a header, short enough to scan. */
export const MAX_SEARCH_PATTERN_BYTES = 64;

/** Characters accepted in the search box, before it is read as bytes. */
export const MAX_SEARCH_QUERY_LENGTH = 512;

/** How many undo steps are kept. Past this the oldest is dropped, not the newest. */
export const MAX_HISTORY_ENTRIES = 500;

/**
 * How many bytes the inspector reads from the caret. Sixteen is what the widest
 * reading — a GUID — needs, so one slice serves every row.
 */
export const INSPECTOR_WINDOW_BYTES = 16;

/**
 * The ceiling on bytes handed to the MCP adapters, which arrive Base64-encoded
 * inside a JSON request rather than as a file on disk. Two mebibytes of bytes is
 * roughly 2.7 MB of Base64, which is a request a model can actually assemble.
 */
export const MAX_MCP_INPUT_BYTES = 2 * 1024 * 1024;

/** Rows one MCP dump call will write, so an answer cannot fill a context window. */
export const MAX_DUMP_ROWS = 512;

export const DEFAULT_ENDIANNESS: Endianness = "little";

export const DEFAULT_COLUMN: HexColumn = "hex";

export const DEFAULT_SEARCH_MODE: SearchMode = "ascii";

/**
 * The most bytes one Copy will put on the clipboard.
 *
 * Ctrl+A over a 512 MiB file selects 512 MiB, and turning that into a hex string
 * is a gigabyte and a half of text that no clipboard will take and no editor
 * will open. Refused by name instead, with the ceiling in the message.
 */
export const MAX_COPY_BYTES = 1024 * 1024;

/** Filename used when a document that was never opened from disk is saved. */
export const FALLBACK_FILENAME = "untitled.bin";
