import type { BulletMarker, EmphasisStyle, HtmlMarkdownMode, HtmlMarkdownOptions } from "../types";

export const DEFAULT_HTML_MARKDOWN_MODE: HtmlMarkdownMode = "htmlToMarkdown";

export const DEFAULT_HTML_MARKDOWN_OPTIONS: HtmlMarkdownOptions = {
    gfm: true,
    // Turndown defaults to setext, which can only express two heading levels.
    // ATX is what CommonMark's own examples use and what every editor writes.
    headingStyle: "atx",
    bulletMarker: "dash",
    codeBlockStyle: "fenced",
    emphasisStyle: "underscore",
    linkStyle: "inlined",
    keepUnsupportedHtml: true,
    lineBreaks: false,
    fullDocument: false,
};

/**
 * Ceiling on a single conversion.
 *
 * Half of what the Base64 tool allows, because this one builds a DOM before it
 * writes anything: parsing is the expensive half and it happens on the main
 * thread. Half a megabyte is a large scraped article and several times the
 * biggest README anybody writes.
 */
export const MAX_HTML_MARKDOWN_INPUT_BYTES = 524_288;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * Elements whose *content* is not prose, dropped before anything is written.
 *
 * Turndown has no rule for these, so its default unwraps them — a page with
 * `<script>alert(1)</script>` in it converts to a paragraph reading `alert(1)`,
 * and a stylesheet arrives as a run of selectors. Neither is a translation of
 * the document; both are debris from the parts of it that were never text.
 * Removing them is a deliberate divergence from the reference implementation,
 * and `HtmlMarkdownSuccess.removed` is what keeps it from being a silent one.
 */
export const STRIPPED_ELEMENTS = ["script", "style", "noscript", "template"] as const;

/**
 * Removed without comment, because nobody was expecting them in a document.
 *
 * A `<meta charset>` reported as "dropped" on every page that carries one would
 * make the notice above worthless within a day — a warning that always fires is
 * a warning nobody reads. Head metadata was never prose; the script that got
 * thrown away is the surprise.
 */
export const STRIPPED_METADATA_ELEMENTS = ["head", "title", "meta", "link", "base"] as const;

/**
 * Elements Markdown cannot say, kept as literal tags when the reader asks.
 *
 * Every Markdown renderer worth the name passes inline HTML through, so a kept
 * `<kbd>Ctrl</kbd>` still renders; an unwrapped one becomes the bare word
 * `Ctrl` and the meaning is gone for good.
 */
export const PRESERVED_ELEMENTS = [
    "abbr",
    "audio",
    "dd",
    "details",
    "dl",
    "dt",
    "figcaption",
    "figure",
    "iframe",
    "ins",
    "kbd",
    "mark",
    "sub",
    "summary",
    "sup",
    "u",
    "video",
] as const;

/** Literal syntax, so it stays out of the message catalogue. */
export const BULLET_CHARACTERS: Record<BulletMarker, "-" | "*" | "+"> = {
    dash: "-",
    asterisk: "*",
    plus: "+",
};

export const EMPHASIS_CHARACTERS: Record<EmphasisStyle, "_" | "*"> = {
    underscore: "_",
    asterisk: "*",
};

/** Falls back into `<title>` when a document has no heading to take one from. */
export const FALLBACK_DOCUMENT_TITLE = "Document";

export const MARKDOWN_MIME_TYPE = "text/markdown;charset=utf-8";

export const HTML_MIME_TYPE = "text/html;charset=utf-8";
