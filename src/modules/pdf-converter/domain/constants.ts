import type { PdfConverterOptions, PdfFontFamily, PdfPasteableFormat } from "../types";

/**
 * What the paste panel opens on, and what a shared link falls back to.
 *
 * A *paste* format rather than a source format: the three notations are the
 * only ones a query string can carry, and a link claiming `docx` would open on
 * a picker with nothing in it.
 */
export const DEFAULT_PDF_PASTE_FORMAT: PdfPasteableFormat = "markdown";

export const DEFAULT_PDF_OPTIONS: PdfConverterOptions = {
    pageSize: "a4",
    // Asks the source rather than the reader: a deck and a spreadsheet are
    // landscape, a memo is not. See `resolveOrientation`.
    orientation: "auto",
    margin: "normal",
    fontSize: 11,
    pageNumbers: true,
    includeImages: true,
    // Off by default. Every link in a scraped article would otherwise double
    // the length of its own paragraph, and most documents are read on a screen
    // where the link still works.
    showLinkUrls: false,
    includeSpeakerNotes: false,
    repeatHeaderRow: true,
    separateSheets: true,
};

export const MIN_PDF_FONT_SIZE = 7;

export const MAX_PDF_FONT_SIZE = 18;

/**
 * The sizes the picker offers, which is narrower than the range it accepts.
 *
 * A shared link or an MCP call may name any whole point size between the two
 * bounds above, and the schema will take it. The panel offers seven, because a
 * list of twelve consecutive integers is a list nobody reads — the useful
 * choices are "smaller", "normal" and "large enough to read across a room",
 * and these are those.
 */
export const PDF_FONT_SIZE_CHOICES = [8, 9, 10, 11, 12, 14, 16] as const;

/* ------------------------------------------------------------------ limits --- */

/**
 * The largest file that may be read.
 *
 * Ten megabytes is a photograph-heavy deck or a very long report, and it is the
 * point past which decompressing a package and building a document model on the
 * main thread stops being something a reader would describe as instant. Nothing
 * is uploaded, so this is a bound on *work* rather than on a request body.
 */
export const MAX_PDF_SOURCE_BYTES = 10 * 1_024 * 1_024;

/** Ceiling on pasted HTML, Markdown or MDX — the same one the editor meters. */
export const MAX_PDF_TEXT_LENGTH = 500_000;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_PDF_SHARED_TEXT_LENGTH = 2048;

/**
 * Blocks in one flowed document.
 *
 * The byte ceiling bounds this for any realistic file, but a megabyte of
 * `<p></p>` would fit and would hand the layout engine two hundred thousand
 * boxes to measure. This is the bound the reader can be told about rather than
 * a tab that stops responding.
 */
export const MAX_PDF_BLOCKS = 20_000;

export const MAX_PDF_SLIDES = 300;

export const MAX_PDF_SHEETS = 40;

/**
 * Rows read from one sheet, and columns from one row.
 *
 * A spreadsheet is not a document, and past a few hundred rows a PDF of one is
 * a worse artefact than the spreadsheet was. Both ceilings are reported through
 * `PdfConversionNotes.truncated` rather than applied quietly.
 */
export const MAX_PDF_SHEET_ROWS = 2_000;

export const MAX_PDF_SHEET_COLUMNS = 40;

/**
 * The largest picture that will be embedded.
 *
 * A four-megabyte image inside a ten-megabyte package is a scan somebody
 * dropped in at full resolution. Embedding it makes a PDF nobody can email;
 * dropping it is reported like every other drop.
 */
export const MAX_PDF_IMAGE_BYTES = 4 * 1_024 * 1_024;

/* ------------------------------------------------------------------- fonts --- */

/** Where the lazily-fetched font pack lives on this origin. */
export const PDF_FONT_DIRECTORY = "/fonts";

/**
 * What each family is made of, and which of them have to be fetched.
 *
 * `Roboto` is already inside pdfmake, so its entry names the files the bundled
 * virtual file system already holds. The other two are packs served from
 * `PDF_FONT_DIRECTORY`, and the island fetches a pack only once a document has
 * actually asked for it — a README in English never downloads the Bengali
 * pack, and a document with no code never downloads the monospace one.
 *
 * Every family declares all four styles, because pdfkit throws rather than
 * substituting when a style it was asked for is missing. Where a pack has no
 * italic cut, the upright file is named twice: a Bengali word set upright where
 * the source wanted it slanted is a far smaller defect than a conversion that
 * stops.
 */
export const PDF_FONT_PACKS = {
    Roboto: {
        bundled: true,
        normal: "Roboto-Regular.ttf",
        bold: "Roboto-Medium.ttf",
        italics: "Roboto-Italic.ttf",
        bolditalics: "Roboto-MediumItalic.ttf",
    },
    NotoSansBengali: {
        bundled: false,
        normal: "NotoSansBengali-Regular.ttf",
        bold: "NotoSansBengali-Bold.ttf",
        italics: "NotoSansBengali-Regular.ttf",
        bolditalics: "NotoSansBengali-Bold.ttf",
    },
    RobotoMono: {
        bundled: false,
        normal: "RobotoMono-Regular.ttf",
        bold: "RobotoMono-Bold.ttf",
        italics: "RobotoMono-Regular.ttf",
        bolditalics: "RobotoMono-Bold.ttf",
    },
} as const satisfies Record<
    PdfFontFamily,
    {
        readonly bundled: boolean;
        readonly normal: string;
        readonly bold: string;
        readonly italics: string;
        readonly bolditalics: string;
    }
>;

/* ------------------------------------------------------------------- misc --- */

export const PDF_MIME_TYPE = "application/pdf";

/** English Metric Units per point — PowerPoint's unit, and PDF's. */
export const EMU_PER_POINT = 12_700;

/** What a deck says its page is when its `<p:sldSz>` cannot be read: 16:9. */
export const DEFAULT_SLIDE_WIDTH_EMU = 12_192_000;

export const DEFAULT_SLIDE_HEIGHT_EMU = 6_858_000;
