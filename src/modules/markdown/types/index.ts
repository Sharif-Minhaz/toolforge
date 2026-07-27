/**
 * Which panes the workbench shows. `split` degrades to a stacked pair below the
 * `lg` breakpoint, where two columns of prose would be unreadable.
 */
export const MARKDOWN_VIEW_MODES = ["editor", "split", "preview"] as const;

export type MarkdownViewMode = (typeof MARKDOWN_VIEW_MODES)[number];

export const MARKDOWN_EXPORT_FORMATS = ["markdown", "html"] as const;

export type MarkdownExportFormat = (typeof MARKDOWN_EXPORT_FORMATS)[number];

/** GitHub's five callout flavours, written as `> [!NOTE]` on a blockquote's first line. */
export const MARKDOWN_ALERT_KINDS = ["note", "tip", "important", "warning", "caution"] as const;

export type MarkdownAlertKind = (typeof MARKDOWN_ALERT_KINDS)[number];

/** Every button the editor toolbar can fire, and nothing else. */
export const MARKDOWN_EDIT_ACTIONS = [
    "bold",
    "italic",
    "strikethrough",
    "inlineCode",
    "heading1",
    "heading2",
    "heading3",
    "quote",
    "bulletList",
    "orderedList",
    "taskList",
    "link",
    "image",
    "codeBlock",
    "table",
    "rule",
] as const;

export type MarkdownEditAction = (typeof MARKDOWN_EDIT_ACTIONS)[number];

export type MarkdownAlign = "left" | "center" | "right" | null;

/* ------------------------------------------------------------------ nodes --- */

/**
 * The parsed document, as data. Deliberately not an HTML string: the renderer
 * builds React elements from these nodes, so nothing the author typed is ever
 * handed to `dangerouslySetInnerHTML` — see `docs` in `parse.ts`.
 */
export type MarkdownInline =
    | { readonly kind: "text"; readonly value: string }
    | { readonly kind: "strong"; readonly children: readonly MarkdownInline[] }
    | { readonly kind: "emphasis"; readonly children: readonly MarkdownInline[] }
    | { readonly kind: "strikethrough"; readonly children: readonly MarkdownInline[] }
    | { readonly kind: "code"; readonly value: string }
    | {
          readonly kind: "link";
          readonly href: string;
          readonly title: string | null;
          readonly children: readonly MarkdownInline[];
      }
    | {
          readonly kind: "image";
          readonly src: string;
          readonly title: string | null;
          readonly alt: string;
      }
    | { readonly kind: "break" }
    | { readonly kind: "math"; readonly tex: string; readonly display: boolean };

export type MarkdownTableCell = {
    readonly align: MarkdownAlign;
    readonly children: readonly MarkdownInline[];
};

export type MarkdownListItem = {
    /** `null` for an ordinary bullet; a boolean only for `- [ ]` task items. */
    readonly checked: boolean | null;
    readonly children: readonly MarkdownBlock[];
};

export type MarkdownHeadingDepth = 1 | 2 | 3 | 4 | 5 | 6;

export type MarkdownBlock =
    | {
          readonly kind: "heading";
          readonly depth: MarkdownHeadingDepth;
          readonly id: string;
          readonly children: readonly MarkdownInline[];
      }
    | { readonly kind: "paragraph"; readonly children: readonly MarkdownInline[] }
    | { readonly kind: "code"; readonly language: string | null; readonly value: string }
    /** A fenced ```mermaid block, rendered by the browser-only diagram island. */
    | { readonly kind: "diagram"; readonly source: string }
    | { readonly kind: "mathBlock"; readonly tex: string }
    | {
          readonly kind: "blockquote";
          readonly alert: MarkdownAlertKind | null;
          readonly children: readonly MarkdownBlock[];
      }
    | {
          readonly kind: "list";
          readonly ordered: boolean;
          readonly start: number;
          /** A list with no blank lines between items; its paragraphs lose their margins. */
          readonly tight: boolean;
          readonly items: readonly MarkdownListItem[];
      }
    | {
          readonly kind: "table";
          readonly header: readonly MarkdownTableCell[];
          readonly rows: readonly (readonly MarkdownTableCell[])[];
      }
    | { readonly kind: "rule" }
    /**
     * Raw HTML the author typed. Kept as literal text rather than markup — the
     * preview shows the tags instead of running them, which is what keeps a
     * shared `?text=` link from executing script on this origin.
     */
    | { readonly kind: "rawHtml"; readonly value: string };

export type MarkdownOutlineEntry = {
    readonly id: string;
    readonly depth: MarkdownHeadingDepth;
    readonly title: string;
};

export type MarkdownDocument = {
    readonly blocks: readonly MarkdownBlock[];
    readonly outline: readonly MarkdownOutlineEntry[];
    /** True when the document contains at least one ```mermaid fence. */
    readonly hasDiagrams: boolean;
    readonly hasMath: boolean;
};

/* --------------------------------------------------------------- failures --- */

export type MarkdownFailureReason = "too_large";

export type MarkdownFailure = {
    readonly ok: false;
    readonly reason: MarkdownFailureReason;
};

export type MarkdownParseResult =
    { readonly ok: true; readonly document: MarkdownDocument } | MarkdownFailure;

/* ------------------------------------------------------------- statistics --- */

export type MarkdownStatistics = {
    readonly words: number;
    readonly characters: number;
    readonly charactersNoSpaces: number;
    readonly lines: number;
    /** Rounded up, so a one-paragraph note still reads as "1 min". */
    readonly readingMinutes: number;
};

/* ------------------------------------------------------------------ editor --- */

/** A textarea's value and caret, the only state a toolbar action needs. */
export type EditorSelection = {
    readonly text: string;
    readonly selectionStart: number;
    readonly selectionEnd: number;
};

/** The scroll state of one pane, as three numbers rather than a DOM node. */
export type ScrollGeometry = {
    readonly scrollTop: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
};

export type ScrollExtent = {
    readonly scrollHeight: number;
    readonly clientHeight: number;
};

/* ------------------------------------------------------------------ export --- */

export type MarkdownExportRequest = {
    readonly format: MarkdownExportFormat;
    readonly source: string;
    /** Serialised preview markup, required by the HTML format and ignored otherwise. */
    readonly renderedHtml?: string;
    readonly title: string;
    readonly includeMathStyles: boolean;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
