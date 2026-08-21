import type { PdfMargin, PdfOrientation, PdfPageSize, SourceDocument } from "../types";
import { EMU_PER_POINT } from "./constants";

/**
 * Page geometry, in PostScript points — 72 to the inch, which is the unit a PDF
 * measures everything in.
 *
 * The sizes are written out rather than handed to `pdfmake` as `"A4"`, because
 * the slide layout needs the numbers as well as the name: a deck is drawn onto
 * a page whose size is the deck's own, and the flow layout has to compute a
 * content width to fit a table into. One table, two readers.
 */

export type PageSizePoints = {
    readonly width: number;
    readonly height: number;
};

/** Portrait dimensions. Landscape is the same pair swapped. */
const PAGE_SIZES: Readonly<Record<PdfPageSize, PageSizePoints>> = {
    a4: { width: 595.28, height: 841.89 },
    letter: { width: 612, height: 792 },
    legal: { width: 612, height: 1008 },
    a3: { width: 841.89, height: 1190.55 },
};

/**
 * Margins in points, as the four numbers `pdfmake` wants: left, top, right,
 * bottom.
 *
 * The bottom is deeper than the top in every one of them. That is not a
 * mistake: the page number sits in the bottom margin, and a footer that crowds
 * the last line of text is the most common way a generated PDF looks generated.
 */
const MARGINS: Readonly<Record<PdfMargin, readonly [number, number, number, number]>> = {
    narrow: [36, 36, 36, 48],
    normal: [56, 54, 56, 64],
    wide: [85, 72, 85, 82],
};

export function pageSizePoints(size: PdfPageSize): PageSizePoints {
    return PAGE_SIZES[size];
}

export function marginPoints(margin: PdfMargin): readonly [number, number, number, number] {
    return MARGINS[margin];
}

/**
 * What `auto` means, which is a question about the document rather than about
 * the reader.
 *
 * A spreadsheet is wider than it is tall and so is a deck; a report is not.
 * Resolving it here rather than in the island keeps the answer testable and
 * keeps the page and the MCP adapter agreeing about it.
 */
export function resolveOrientation(
    orientation: PdfOrientation,
    document: SourceDocument,
): "portrait" | "landscape" {
    if (orientation !== "auto") {
        return orientation;
    }

    if (document.layout === "slides") {
        return document.slideWidthEmu >= document.slideHeightEmu ? "landscape" : "portrait";
    }

    // A flowed document is portrait unless it is mostly a wide table — which is
    // what a converted workbook is, and nothing else here produces.
    const widestTable = document.blocks.reduce(
        (widest, block) =>
            block.kind === "table"
                ? Math.max(widest, block.head?.length ?? 0, ...block.rows.map((row) => row.length))
                : widest,
        0,
    );

    return widestTable >= LANDSCAPE_COLUMN_THRESHOLD ? "landscape" : "portrait";
}

/**
 * The column count past which a portrait page stops being readable.
 *
 * Six columns of a spreadsheet fit across A4 portrait at eleven point with room
 * for the values; seven start to wrap mid-word. The number is a judgement, and
 * the control is there for the reader who disagrees with it.
 */
export const LANDSCAPE_COLUMN_THRESHOLD = 7;

export function orientedSize(size: PageSizePoints, landscape: boolean): PageSizePoints {
    return landscape ? { width: size.height, height: size.width } : size;
}

export function emuToPoints(emu: number): number {
    return emu / EMU_PER_POINT;
}

/**
 * How much of a page is left for content once the margins are taken out.
 *
 * Needed because `pdfmake` sizes a table's `*` columns against the frame it is
 * given, and a table placed at an absolute position — which is what a slide's
 * shapes are — gets no frame at all unless one is computed.
 */
export function contentWidth(size: PageSizePoints, margin: PdfMargin): number {
    const [left, , right] = marginPoints(margin);

    return size.width - left - right;
}
