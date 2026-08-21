/**
 * The six notations this tool reads. Each is a *file* first — the three text
 * ones can also be pasted, which is what `PDF_PASTEABLE_FORMATS` below is for.
 *
 * `docx`, `pptx` and `xlsx` name the Open XML packages, never the pre-2007
 * binaries. `.doc`, `.ppt` and `.xls` are a different file format wearing a
 * similar extension, and the reader is told so by name rather than watching a
 * ZIP reader fail on bytes that were never a ZIP.
 */
export const PDF_SOURCE_FORMATS = ["html", "markdown", "mdx", "docx", "pptx", "xlsx"] as const;

export type PdfSourceFormat = (typeof PDF_SOURCE_FORMATS)[number];

/** The formats a person can paste rather than pick off disk. */
export const PDF_PASTEABLE_FORMATS = ["html", "markdown", "mdx"] as const;

export type PdfPasteableFormat = (typeof PDF_PASTEABLE_FORMATS)[number];

/* ------------------------------------------------------------- the model --- */

/**
 * One stretch of text with one set of marks on it.
 *
 * Deliberately flat rather than a tree: every reader below produces runs, the
 * renderer consumes runs, and nothing in between needs to know that `<b><i>`
 * was nested rather than `<i><b>`.
 */
export type InlineRun = {
    readonly text: string;
    readonly bold?: boolean;
    readonly italic?: boolean;
    readonly underline?: boolean;
    readonly strike?: boolean;
    /** Monospace, and left out of the link colouring above. */
    readonly code?: boolean;
    /** Absolute destination, or `null` for a link with nowhere to go. */
    readonly link?: string;
};

export type ListItem = {
    /** Nesting depth, zero-based. Renderers indent from this rather than nesting. */
    readonly level: number;
    readonly runs: readonly InlineRun[];
};

export type TableCell = {
    readonly runs: readonly InlineRun[];
    /** Right for numbers, left for everything else. Set by the reader, not guessed. */
    readonly align?: "left" | "center" | "right";
    readonly colSpan?: number;
    readonly rowSpan?: number;
};

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Everything a flowed document can be made of.
 *
 * The list is short on purpose. A PDF page has no `<aside>` and no `<details>`;
 * anything a reader cannot express as one of these becomes a paragraph, which
 * is a smaller loss than a block silently disappearing.
 */
export type DocBlock =
    | {
          readonly kind: "heading";
          readonly level: HeadingLevel;
          readonly runs: readonly InlineRun[];
      }
    | { readonly kind: "paragraph"; readonly runs: readonly InlineRun[] }
    | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly ListItem[] }
    | { readonly kind: "code"; readonly text: string }
    | { readonly kind: "quote"; readonly runs: readonly InlineRun[] }
    | {
          readonly kind: "table";
          /** Present only when the source actually marked a header row. */
          readonly head: readonly TableCell[] | null;
          readonly rows: readonly (readonly TableCell[])[];
          readonly caption: string | null;
      }
    | { readonly kind: "image"; readonly image: EmbeddedImage }
    | { readonly kind: "rule" }
    | { readonly kind: "pageBreak" };

/**
 * A picture already in a form PDF can carry.
 *
 * PDF itself stores JPEG and PNG and nothing else, so a reader that meets a
 * GIF, a WMF or an EMF does not convert it — it drops it and says which format
 * it dropped, in `PdfConversionSuccess.droppedImages`.
 */
export type EmbeddedImage = {
    /** `data:image/png;base64,…`. Ready for the renderer with no further work. */
    readonly dataUri: string;
    readonly widthPx: number | null;
    readonly heightPx: number | null;
    readonly alt: string | null;
};

/* ------------------------------------------------------------------ slides --- */

/** A shape's box on the slide, in English Metric Units — 914 400 to the inch. */
export type SlideFrame = {
    readonly xEmu: number;
    readonly yEmu: number;
    readonly widthEmu: number;
    readonly heightEmu: number;
};

export type SlideParagraph = {
    /** Outline depth, zero-based, straight from `<a:pPr lvl=…>`. */
    readonly level: number;
    readonly bulleted: boolean;
    readonly align: "left" | "center" | "right" | "justify";
    /** Point size the deck asked for, or `null` to let the renderer decide. */
    readonly sizePt: number | null;
    readonly runs: readonly InlineRun[];
};

/**
 * Which slot on the layout a shape fills.
 *
 * Kept because it is the only thing left to size a run by once a deck has
 * declined to say: a title with no `sz` is 44 point and a bullet with no `sz`
 * is 18, and the difference between them is the difference between a slide and
 * a wall of identical text.
 */
export const SLIDE_PLACEHOLDERS = ["title", "body", "other"] as const;

export type SlidePlaceholder = (typeof SLIDE_PLACEHOLDERS)[number];

export type SlideShape =
    | {
          readonly kind: "text";
          readonly frame: SlideFrame;
          readonly placeholder: SlidePlaceholder;
          readonly paragraphs: readonly SlideParagraph[];
      }
    | { readonly kind: "image"; readonly frame: SlideFrame; readonly image: EmbeddedImage }
    | {
          readonly kind: "table";
          readonly frame: SlideFrame;
          readonly head: readonly TableCell[] | null;
          readonly rows: readonly (readonly TableCell[])[];
      };

export type Slide = {
    /** 1-based, and the number printed on the page when page numbers are on. */
    readonly number: number;
    readonly shapes: readonly SlideShape[];
    /** Speaker notes, flowed. Empty unless the deck carried any. */
    readonly notes: readonly DocBlock[];
};

/**
 * What every reader produces and the renderer consumes.
 *
 * Two layouts rather than one, because a slide is not a long document with
 * page breaks in it: its shapes carry coordinates, and flattening them to a
 * flow would throw away the only thing that makes a deck look like the deck.
 */
export type SourceDocument =
    | {
          readonly layout: "flow";
          /** The document's own title, when it has one. Used for the filename. */
          readonly title: string | null;
          readonly blocks: readonly DocBlock[];
      }
    | {
          readonly layout: "slides";
          readonly title: string | null;
          readonly slides: readonly Slide[];
          /** The deck's own page size, so the PDF keeps its aspect ratio. */
          readonly slideWidthEmu: number;
          readonly slideHeightEmu: number;
      };

/* ----------------------------------------------------------------- options --- */

export const PDF_PAGE_SIZES = ["a4", "letter", "legal", "a3"] as const;

export type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];

/**
 * `auto` is not a third orientation — it is a rule. A deck and a spreadsheet
 * are wider than they are tall and a memo is not, so `auto` asks the source
 * rather than the reader. See `resolveOrientation` in `domain/page.ts`.
 */
export const PDF_ORIENTATIONS = ["auto", "portrait", "landscape"] as const;

export type PdfOrientation = (typeof PDF_ORIENTATIONS)[number];

export const PDF_MARGINS = ["narrow", "normal", "wide"] as const;

export type PdfMargin = (typeof PDF_MARGINS)[number];

export type PdfConverterOptions = {
    readonly pageSize: PdfPageSize;
    readonly orientation: PdfOrientation;
    readonly margin: PdfMargin;
    /** Base body size in points. Everything else is scaled from it. */
    readonly fontSize: number;
    /** A centred `n / total` in the bottom margin. */
    readonly pageNumbers: boolean;
    /** Off drops every picture and reports the count rather than the format. */
    readonly includeImages: boolean;
    /**
     * Prints a link's address after its text. A PDF is read on paper as often
     * as on a screen, and blue words with nothing behind them are the single
     * most common thing lost in the move from a page to a print-out.
     */
    readonly showLinkUrls: boolean;
    /** Speaker notes, under each slide. `pptx` only. */
    readonly includeSpeakerNotes: boolean;
    /** Repeats a sheet's first row at the top of every page it spills onto. `xlsx` only. */
    readonly repeatHeaderRow: boolean;
    /** A heading naming each sheet, and a page break between them. `xlsx` only. */
    readonly separateSheets: boolean;
};

/* ---------------------------------------------------------------- failures --- */

/**
 * Every way this tool refuses, each keeping its own name.
 *
 * `empty_source` and `no_content` are two different things and are worth
 * separating: the first is a file with nothing in it, the second is a file
 * that parsed and turned out to hold no text at all — a deck of pictures, a
 * spreadsheet of empty cells. The fix for one is a different file; the fix for
 * the other may be turning images back on.
 */
export const PDF_FAILURE_REASONS = [
    "empty_source",
    "too_large",
    "unknown_format",
    "legacy_office_format",
    "not_a_package",
    "wrong_package",
    "malformed_source",
    "no_content",
    "too_many_blocks",
] as const;

export type PdfFailureReason = (typeof PDF_FAILURE_REASONS)[number];

export type PdfConversionFailure = {
    readonly ok: false;
    readonly reason: PdfFailureReason;
    /** The format the package turned out to be, set only for `wrong_package`. */
    readonly actualFormat?: PdfSourceFormat;
};

/**
 * A script this site has a font for, or knows it has not.
 *
 * Members are message keys as well as classifications, so adding one means
 * adding it to both locale catalogues. `latin` covers the Greek and Cyrillic
 * Roboto also carries — they are one font decision, not three.
 */
export const PDF_SCRIPTS = [
    "latin",
    "bengali",
    "devanagari",
    "arabic",
    "hebrew",
    "thai",
    "cjk",
    "hangul",
    "other",
] as const;

export type PdfScript = (typeof PDF_SCRIPTS)[number];

/** What a reader threw away, so the tool can say so instead of shipping a gap. */
export type PdfConversionNotes = {
    /** Images dropped, by the media type that could not be embedded. */
    readonly droppedImageTypes: readonly string[];
    /** Sheets, slides, rows or columns cut at a ceiling. */
    readonly truncated: readonly PdfTruncation[];
    /** Scripts present in the text that no bundled font can draw. */
    readonly unsupportedScripts: readonly PdfScript[];
    /** MDX constructs removed before the Markdown was read. */
    readonly strippedMdx: readonly ("import" | "export" | "jsx" | "expression")[];
};

export const PDF_TRUNCATION_KINDS = ["sheets", "rows", "columns", "slides", "blocks"] as const;

export type PdfTruncationKind = (typeof PDF_TRUNCATION_KINDS)[number];

export type PdfTruncation = {
    readonly kind: PdfTruncationKind;
    readonly kept: number;
    readonly total: number;
};

export type PdfConversionSuccess = {
    readonly ok: true;
    readonly format: PdfSourceFormat;
    readonly document: SourceDocument;
    readonly notes: PdfConversionNotes;
};

export type PdfConversionResult = PdfConversionSuccess | PdfConversionFailure;

/* ------------------------------------------------------------------- fonts --- */

/**
 * The font families the renderer may name.
 *
 * `Roboto` ships inside pdfmake and covers Latin, Greek and Cyrillic. The other
 * two are packs fetched from this origin the first time a document needs one —
 * `NotoSansBengali` for Bengali text, `RobotoMono` for code.
 *
 * Neither pack is a superset of Roboto. Noto Sans Bengali carries *no* Latin
 * glyphs at all, not even a full stop, and Roboto Mono has no Bengali. That is
 * why `domain/font-runs.ts` splits by codepoint rather than choosing one family
 * for a paragraph: the run is what has a font, not the block.
 */
export const PDF_FONT_FAMILIES = ["Roboto", "NotoSansBengali", "RobotoMono"] as const;

export type PdfFontFamily = (typeof PDF_FONT_FAMILIES)[number];

/** One stretch of text that a single family can draw. */
export type FontRun = {
    readonly text: string;
    readonly font: PdfFontFamily;
};
