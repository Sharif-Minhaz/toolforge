/**
 * Which way the conversion runs. Named for both ends rather than "encode" and
 * "decode", because neither format is the encoded one — a reader arriving from
 * a search result has to be able to tell the two buttons apart at a glance.
 */
export const HTML_MARKDOWN_MODES = ["htmlToMarkdown", "markdownToHtml"] as const;

export type HtmlMarkdownMode = (typeof HTML_MARKDOWN_MODES)[number];

/** `# Title` against `Title` over a rule of `=`. ATX is what CommonMark shows. */
export const HEADING_STYLES = ["atx", "setext"] as const;

export type HeadingStyle = (typeof HEADING_STYLES)[number];

export const BULLET_MARKERS = ["dash", "asterisk", "plus"] as const;

export type BulletMarker = (typeof BULLET_MARKERS)[number];

/** A fence carries the language; four spaces of indentation cannot. */
export const CODE_BLOCK_STYLES = ["fenced", "indented"] as const;

export type CodeBlockStyle = (typeof CODE_BLOCK_STYLES)[number];

export const EMPHASIS_STYLES = ["underscore", "asterisk"] as const;

export type EmphasisStyle = (typeof EMPHASIS_STYLES)[number];

/** `[text](url)` against `[text][1]` with the addresses collected at the end. */
export const LINK_STYLES = ["inlined", "referenced"] as const;

export type LinkStyle = (typeof LINK_STYLES)[number];

/**
 * Everything either direction can be told to do, beyond the input itself.
 *
 * One object rather than nine pieces of state, so the island has one updater
 * and the search-param parser has one shape to fill. `gfm` is the only member
 * both directions read; the rest belong to one of them and are hidden in the
 * other, which is what `appliesTo` in `domain/convert.ts` decides.
 */
export type HtmlMarkdownOptions = {
    /**
     * GitHub's extensions to CommonMark: tables, `~~strikethrough~~`, and
     * `- [x]` task lists. Read in both directions — with it off, an HTML table
     * flattens to paragraphs on the way out and a pipe table stays literal text
     * on the way in.
     */
    readonly gfm: boolean;
    readonly headingStyle: HeadingStyle;
    readonly bulletMarker: BulletMarker;
    readonly codeBlockStyle: CodeBlockStyle;
    readonly emphasisStyle: EmphasisStyle;
    readonly linkStyle: LinkStyle;
    /**
     * Keeps elements Markdown has no syntax for — `<sub>`, `<kbd>`, `<details>`
     * — as literal tags instead of unwrapping them to their text. Markdown
     * renderers pass inline HTML through, so keeping is the lossless choice.
     */
    readonly keepUnsupportedHtml: boolean;
    /** Turns a single newline into `<br>`, the way a comment box does. */
    readonly lineBreaks: boolean;
    /** Wraps the markup in a standalone `<!doctype html>` file. */
    readonly fullDocument: boolean;
};

/* --------------------------------------------------------------- failures --- */

export type HtmlMarkdownFailureReason = "too_large" | "unconvertible";

export type HtmlMarkdownFailure = {
    readonly ok: false;
    readonly reason: HtmlMarkdownFailureReason;
};

export type HtmlMarkdownSuccess = {
    readonly ok: true;
    readonly output: string;
    readonly inputBytes: number;
    readonly outputBytes: number;
    /**
     * Elements dropped on the way out, deduplicated and lowercase — `script`,
     * `style`. Reported rather than silently swallowed: a converter that turns
     * `alert(1)` into a paragraph of prose is worse than one that says it threw
     * the script away.
     */
    readonly removed: readonly string[];
};

export type HtmlMarkdownResult = HtmlMarkdownSuccess | HtmlMarkdownFailure;

/* ----------------------------------------------------------------- export --- */

export type HtmlMarkdownExportRequest = {
    readonly mode: HtmlMarkdownMode;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
