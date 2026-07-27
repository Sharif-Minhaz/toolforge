import type { MarkdownViewMode } from "../types";

export const DEFAULT_MARKDOWN_VIEW: MarkdownViewMode = "split";

/** Scroll linking is on by default: reading side by side is the point of split view. */
export const DEFAULT_SYNC_SCROLL = true;

/**
 * Ceiling on a single parse. The whole pipeline runs on the main thread, and a
 * quarter of a million characters is already several hundred printed pages.
 */
export const MAX_MARKDOWN_LENGTH = 250_000;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * Words per minute used for the reading estimate. 200 is the usual figure for
 * silent reading of technical prose.
 */
export const READING_WORDS_PER_MINUTE = 200;

/** Fence languages that render as a diagram instead of as source. */
export const DIAGRAM_LANGUAGE = "mermaid";

/** URL schemes a link may use; everything else renders as inert text. */
export const SAFE_URL_SCHEMES = ["http", "https", "mailto", "tel", "ftp"] as const;
