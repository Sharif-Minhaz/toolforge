import type {
    Content,
    ContentOrderedList,
    ContentStack,
    ContentTable,
    ContentText,
    ContentUnorderedList,
    Decoration,
    TableCell as PdfTableCell,
    TDocumentDefinitions,
} from "pdfmake/interfaces";

import type {
    DocBlock,
    HeadingLevel,
    InlineRun,
    PdfConverterOptions,
    Slide,
    SlideFrame,
    SlideParagraph,
    SlideShape,
    SourceDocument,
    TableCell,
} from "../types";
import { splitIntoFontRuns } from "./font-runs";
import {
    contentWidth,
    emuToPoints,
    marginPoints,
    orientedSize,
    pageSizePoints,
    resolveOrientation,
} from "./page";
import { toRectangularGrid } from "./table-grid";

/**
 * The document model turned into a `pdfmake` document definition.
 *
 * The definition is data — a plain object, built here and handed to the engine
 * somewhere else. That seam is the whole reason the layout is testable: the
 * renderer runs under `bun test` with no canvas, no fonts and no engine, and
 * what it produces can be asserted line by line. Only `createPdf` needs a
 * browser, and it is called in exactly one place.
 *
 * Two layouts, and they share almost nothing but the run renderer. A flowed
 * document is a sequence of blocks that pdfmake breaks across pages; a deck is
 * a set of boxes at coordinates, one page per slide, where nothing flows at all.
 */

/**
 * The ink.
 *
 * `CLAUDE.md` rule 24 says design tokens and never raw colours, with an
 * exception for a canvas paint colour over a photograph. This is the same
 * exception wearing a different hat: a PDF is not this site. It has no
 * stylesheet, no custom properties and no dark mode — the reader may well print
 * it — so a semantic token has nothing to resolve against. These are the
 * document's ink, chosen for paper, and they are the only raw colours in the
 * module.
 */
/**
 * The one piece of copy this tool writes into a document itself.
 *
 * A speaker-notes page needs a heading, and a heading is a user-facing string —
 * so it cannot be a literal in here. The domain layer has no catalogue and is
 * not allowed one, so the caller supplies the sentence and the domain supplies
 * the slide number. The page passes a translated one; anything without a locale
 * gets the default below.
 */
export type PdfLabels = {
    readonly speakerNotes: (slideNumber: number) => string;
};

export const DEFAULT_PDF_LABELS: PdfLabels = {
    speakerNotes: (slideNumber) => `Notes — slide ${slideNumber}`,
};

export const PDF_INK = {
    body: "#1f2328",
    heading: "#111418",
    muted: "#6a7280",
    link: "#1a56db",
    rule: "#d8dce2",
    codeBackground: "#f4f5f7",
    tableHeaderBackground: "#eef0f3",
    tableStripe: "#f8f9fa",
    tableBorder: "#d8dce2",
} as const;

/** Named so the definition stays JSON; the engine registers them by name. */
export const TABLE_LAYOUT = "toolforgeTable";

export const CODE_LAYOUT = "toolforgeCode";

/** Heading sizes, as multiples of the body size the reader chose. */
const HEADING_SCALE: Readonly<Record<HeadingLevel, number>> = {
    1: 1.9,
    2: 1.55,
    3: 1.32,
    4: 1.16,
    5: 1.06,
    6: 1,
};

const LIST_INDENT_POINTS = 14;

/** A deck that gave a shape no box of its own gets one, rather than a zero. */
const FALLBACK_INSET_RATIO = 0.06;

/* ------------------------------------------------------------------- runs --- */

type RunContext = {
    readonly options: PdfConverterOptions;
    readonly sizePt: number;
    readonly color: string;
};

/**
 * One inline run as the pieces `pdfmake` needs, split so each piece names a
 * font that can actually draw it.
 *
 * The split is the reason this is not a one-liner. See `font-runs.ts`: the
 * Bengali face has no Latin glyphs and the monospace face has no Bengali, so a
 * single `font` on the whole run would empty part of it whichever family was
 * chosen.
 */
function renderRun(run: InlineRun, context: RunContext): ContentText[] {
    const monospaced = run.code === true;
    const decoration: Decoration | Decoration[] | undefined =
        run.underline === true && run.strike === true
            ? ["underline", "lineThrough"]
            : run.underline === true
              ? "underline"
              : run.strike === true
                ? "lineThrough"
                : undefined;

    const pieces = splitIntoFontRuns(run.text, monospaced).map((piece): ContentText => ({
        text: piece.text,
        font: piece.font,
        bold: run.bold === true ? true : undefined,
        italics: run.italic === true ? true : undefined,
        decoration: run.link !== undefined && decoration === undefined ? "underline" : decoration,
        color: run.link === undefined ? context.color : PDF_INK.link,
        link: run.link,
        // A monospace face at the same nominal size reads larger than the
        // body face beside it, because its glyphs are wider. Nine tenths is
        // what puts an inline `identifier` back on the same optical line as
        // the words around it.
        fontSize: monospaced ? round(context.sizePt * 0.9) : undefined,
        preserveLeadingSpaces: monospaced ? true : undefined,
    }));

    if (!shouldPrintUrl(run, context.options)) {
        return pieces;
    }

    return [
        ...pieces,
        {
            text: ` (${run.link})`,
            font: "Roboto",
            color: PDF_INK.muted,
            fontSize: round(context.sizePt * 0.85),
        },
    ];
}

/**
 * Whether a link's address is worth printing after its text.
 *
 * Not when the text already *is* the address — a bare URL followed by itself in
 * brackets is the most common way this feature makes a document worse.
 */
function shouldPrintUrl(run: InlineRun, options: PdfConverterOptions): boolean {
    if (!options.showLinkUrls || run.link === undefined) {
        return false;
    }

    const text = run.text.trim();

    return text !== run.link && text !== run.link.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function renderRuns(runs: readonly InlineRun[], context: RunContext): ContentText[] {
    return runs.flatMap((run) => renderRun(run, context));
}

/* ------------------------------------------------------------------ flow --- */

type FlowContext = {
    readonly options: PdfConverterOptions;
    readonly base: number;
    readonly width: number;
    readonly maxImageHeight: number;
};

function renderBlock(block: DocBlock, context: FlowContext): Content | null {
    const { base } = context;
    const runContext: RunContext = {
        options: context.options,
        sizePt: base,
        color: PDF_INK.body,
    };

    switch (block.kind) {
        case "heading": {
            const size = round(base * HEADING_SCALE[block.level]);

            return {
                text: renderRuns(block.runs, { ...runContext, sizePt: size }),
                fontSize: size,
                bold: true,
                color: PDF_INK.heading,
                // Kept with what follows it, so a heading is never the last
                // thing on a page with its own paragraph overleaf.
                headlineLevel: block.level,
                margin: [0, round(base * 1.1), 0, round(base * 0.45)],
            };
        }

        case "paragraph":
            return {
                text: renderRuns(block.runs, runContext),
                margin: [0, 0, 0, round(base * 0.55)],
            };

        case "quote":
            return {
                text: renderRuns(block.runs, { ...runContext, color: PDF_INK.muted }),
                italics: true,
                margin: [round(base * 1.4), 0, 0, round(base * 0.6)],
            };

        case "code":
            return {
                table: {
                    widths: ["*"],
                    body: [
                        [
                            {
                                text: block.text,
                                font: "RobotoMono",
                                fontSize: round(base * 0.85),
                                color: PDF_INK.body,
                                preserveLeadingSpaces: true,
                                lineHeight: 1.25,
                            },
                        ],
                    ],
                },
                layout: CODE_LAYOUT,
                margin: [0, round(base * 0.2), 0, round(base * 0.7)],
            };

        case "list":
            return {
                ...nestList(block.items, 0, block.ordered, runContext),
                margin: [0, 0, 0, round(base * 0.6)],
            };

        case "table":
            return renderTable(block, context);

        case "image":
            return {
                image: block.image.dataUri,
                // `fit` rather than `width`, so a picture wider than the page
                // shrinks instead of being clipped and a small one is not blown
                // up past its own pixels.
                fit: [context.width, context.maxImageHeight],
                margin: [0, round(base * 0.3), 0, round(base * 0.6)],
            };

        case "rule":
            return {
                canvas: [
                    {
                        type: "line",
                        x1: 0,
                        y1: 0,
                        x2: context.width,
                        y2: 0,
                        lineWidth: 0.7,
                        lineColor: PDF_INK.rule,
                    },
                ],
                margin: [0, round(base * 0.5), 0, round(base * 0.9)],
            };

        case "pageBreak":
            return { text: "", pageBreak: "before" };

        default:
            return null;
    }
}

/**
 * The flattened items turned back into the nesting a list renderer wants.
 *
 * Readers flatten because a nested `<ul>` is a child of the `<li>` above it
 * rather than a sibling, and levels are the only thing all four sources agree
 * on. `pdfmake` wants the tree back, so it is rebuilt here — and rebuilt rather
 * than kept, because an ordered list restarted inside another counts from one
 * again, which is what the sources mean and what a tree preserves.
 */
function nestList(
    items: readonly { readonly level: number; readonly runs: readonly InlineRun[] }[],
    level: number,
    ordered: boolean,
    context: RunContext,
): ContentUnorderedList | ContentOrderedList {
    const rendered: Content[] = [];
    let index = 0;

    while (index < items.length) {
        const item = items[index];

        if (item.level <= level) {
            rendered.push({ text: renderRuns(item.runs, context) });
            index += 1;

            continue;
        }

        const start = index;

        while (index < items.length && items[index].level > level) {
            index += 1;
        }

        rendered.push({
            ...nestList(items.slice(start, index), level + 1, ordered, context),
            margin: [LIST_INDENT_POINTS, 2, 0, 2],
        });
    }

    return ordered ? { ol: rendered } : { ul: rendered };
}

function renderTable(
    block: Extract<DocBlock, { kind: "table" }>,
    context: FlowContext,
): Content | null {
    const grid = toRectangularGrid([...(block.head === null ? [] : [block.head]), ...block.rows]);

    if (grid.rows.length === 0) {
        return null;
    }

    const headerRows = block.head === null ? 0 : 1;
    const runContext: RunContext = {
        options: context.options,
        // A table carries more words per line than prose does, so it is set one
        // notch down. Below eight point it stops being readable on paper, which
        // is the floor rather than a preference.
        sizePt: Math.max(8, round(context.base * 0.92)),
        color: PDF_INK.body,
    };

    const body = grid.rows.map((row, rowIndex) =>
        row.map((slot) => {
            if (slot.kind === "spanned") {
                return {};
            }

            return renderCell(slot.cell, rowIndex < headerRows, runContext);
        }),
    );

    const table: Content = {
        table: {
            headerRows: context.options.repeatHeaderRow ? headerRows : 0,
            widths: Array.from({ length: grid.columnCount }, () => "*"),
            body,
            // A row split across a page break is unreadable in a spreadsheet
            // and merely ugly in prose, so it is refused in both.
            dontBreakRows: true,
        },
        layout: TABLE_LAYOUT,
        margin: [0, round(context.base * 0.3), 0, round(context.base * 0.8)],
    };

    if (block.caption === null) {
        return table;
    }

    return {
        stack: [
            table,
            {
                text: block.caption,
                fontSize: round(context.base * 0.85),
                color: PDF_INK.muted,
                alignment: "center",
                margin: [0, round(-context.base * 0.5), 0, round(context.base * 0.8)],
            },
        ],
    };
}

function renderCell(cell: TableCell, header: boolean, context: RunContext): PdfTableCell {
    return {
        text: renderRuns(cell.runs, context),
        bold: header ? true : undefined,
        alignment: cell.align,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
        fillColor: header ? PDF_INK.tableHeaderBackground : undefined,
    };
}

function buildFlowDefinition(
    document: Extract<SourceDocument, { layout: "flow" }>,
    options: PdfConverterOptions,
): TDocumentDefinitions {
    const landscape = resolveOrientation(options.orientation, document) === "landscape";
    const size = orientedSize(pageSizePoints(options.pageSize), landscape);
    const margins = marginPoints(options.margin);
    const width = contentWidth(size, options.margin);
    const base = options.fontSize;

    const context: FlowContext = {
        options,
        base,
        width,
        maxImageHeight: size.height - margins[1] - margins[3],
    };

    const content = document.blocks
        .map((block) => renderBlock(block, context))
        .filter((item): item is Content => item !== null);

    return {
        pageSize: { width: size.width, height: size.height },
        pageMargins: [...margins],
        content: content.length > 0 ? content : [{ text: "" }],
        defaultStyle: {
            font: "Roboto",
            fontSize: base,
            color: PDF_INK.body,
            lineHeight: 1.35,
        },
        ...(options.pageNumbers ? { footer: pageNumberFooter(base) } : {}),
    };
}

/**
 * The page number in the bottom margin.
 *
 * A function, which is the one part of the definition that is not data —
 * `pdfmake` calls it per page and there is no declarative form of "how many
 * pages did this turn out to be". Tests assert the content array rather than
 * the whole object for that reason.
 */
function pageNumberFooter(base: number): TDocumentDefinitions["footer"] {
    return (currentPage: number, pageCount: number) => ({
        text: `${currentPage} / ${pageCount}`,
        alignment: "center",
        fontSize: round(base * 0.78),
        color: PDF_INK.muted,
        margin: [0, round(base * 0.9), 0, 0],
    });
}

/* ----------------------------------------------------------------- slides --- */

type SlideContext = {
    readonly options: PdfConverterOptions;
    readonly labels: PdfLabels;
    readonly widthPt: number;
    readonly heightPt: number;
};

/** Point sizes a deck falls back to when a run does not name one. */
const SLIDE_TITLE_SIZE = 40;

const SLIDE_BODY_SIZE = 18;

function frameToPoints(
    frame: SlideFrame,
    order: number,
    context: SlideContext,
): { readonly x: number; readonly y: number; readonly width: number } {
    const width = emuToPoints(frame.widthEmu);

    if (width > 1) {
        return { x: emuToPoints(frame.xEmu), y: emuToPoints(frame.yEmu), width };
    }

    // A shape whose box neither it nor its layout declared. Stacking them down
    // the slide is a guess, but it is a guess that keeps the text on the page —
    // the alternative is a zero-width box, which draws nothing at all.
    const inset = context.widthPt * FALLBACK_INSET_RATIO;

    return {
        x: inset,
        y: inset + order * Math.max(30, context.heightPt * 0.14),
        width: context.widthPt - inset * 2,
    };
}

function renderSlideParagraph(
    paragraph: SlideParagraph,
    base: number,
    context: SlideContext,
): Content {
    const size = paragraph.sizePt ?? base;
    const runContext: RunContext = {
        options: context.options,
        sizePt: size,
        color: PDF_INK.body,
    };

    const bullet: ContentText[] = paragraph.bulleted
        ? [{ text: "• ", font: "Roboto", color: PDF_INK.muted }]
        : [];

    return {
        text: [...bullet, ...renderRuns(paragraph.runs, runContext)],
        fontSize: size,
        alignment: paragraph.align,
        margin: [paragraph.level * LIST_INDENT_POINTS, 0, 0, round(size * 0.3)],
    };
}

function renderSlideShape(shape: SlideShape, order: number, context: SlideContext): Content | null {
    const box = frameToPoints(shape.frame, order, context);

    if (shape.kind === "image") {
        const height = emuToPoints(shape.frame.heightEmu);

        return {
            image: shape.image.dataUri,
            absolutePosition: { x: box.x, y: box.y },
            // Both dimensions, because a slide's picture was placed into a box
            // rather than flowed — its aspect ratio is the deck's decision, and
            // reflowing it to `fit` would move everything beside it.
            width: box.width,
            ...(height > 1 ? { height } : {}),
        };
    }

    if (shape.kind === "table") {
        const grid = toRectangularGrid([
            ...(shape.head === null ? [] : [shape.head]),
            ...shape.rows,
        ]);

        if (grid.rows.length === 0) {
            return null;
        }

        const runContext: RunContext = {
            options: context.options,
            sizePt: 12,
            color: PDF_INK.body,
        };

        return placedAt(box, {
            table: {
                headerRows: shape.head === null ? 0 : 1,
                widths: Array.from({ length: grid.columnCount }, () => "*"),
                body: grid.rows.map((row, rowIndex) =>
                    row.map((slot) =>
                        slot.kind === "spanned"
                            ? {}
                            : renderCell(
                                  slot.cell,
                                  rowIndex === 0 && shape.head !== null,
                                  runContext,
                              ),
                    ),
                ),
            },
            layout: TABLE_LAYOUT,
        });
    }

    const base = shape.placeholder === "title" ? SLIDE_TITLE_SIZE : SLIDE_BODY_SIZE;

    return placedAt(box, {
        stack: shape.paragraphs.map((paragraph) => renderSlideParagraph(paragraph, base, context)),
    });
}

/**
 * A block pinned to a slide coordinate, at a width the shape declared.
 *
 * The wrapper is a single-column `columns` block rather than the block itself,
 * because `width` is a *column* property in `pdfmake` — set directly on a
 * stack or a table it is ignored, and every text box on the slide would then
 * run the full width of the page and overlap its neighbour.
 */
function placedAt(
    box: { readonly x: number; readonly y: number; readonly width: number },
    content: ContentStack | ContentTable | ContentText,
): Content {
    return {
        absolutePosition: { x: box.x, y: box.y },
        columns: [{ ...content, width: box.width }],
    };
}

function renderSlide(slide: Slide, index: number, context: SlideContext): readonly Content[] {
    const items: Content[] = [
        // Absolutely-positioned content is drawn onto whichever page the writer
        // is on, and never advances it. This zero-height element is what makes
        // one slide one page: it is the only thing in the slide layout that
        // actually flows.
        { text: "", ...(index === 0 ? {} : { pageBreak: "before" as const }) },
    ];

    for (const [order, shape] of slide.shapes.entries()) {
        const rendered = renderSlideShape(shape, order, context);

        if (rendered !== null) {
            items.push(rendered);
        }
    }

    if (context.options.pageNumbers) {
        items.push(
            placedAt(
                { x: context.widthPt - 54, y: context.heightPt - 30, width: 36 },
                {
                    text: String(slide.number),
                    alignment: "right",
                    fontSize: 10,
                    color: PDF_INK.muted,
                },
            ),
        );
    }

    if (slide.notes.length === 0) {
        return items;
    }

    const notesBase = 11;
    const notesContext: FlowContext = {
        options: context.options,
        base: notesBase,
        width: context.widthPt - 96,
        maxImageHeight: context.heightPt - 96,
    };

    items.push({
        pageBreak: "before",
        margin: [48, 48, 48, 48],
        // Set on the stack rather than each block. A deck's `defaultStyle` is
        // the slide's body size — eighteen point, which is right on a slide and
        // twice what a page of prose wants — and every block inside inherits
        // from the nearest ancestor that names one.
        fontSize: notesBase,
        stack: [
            {
                text: context.labels.speakerNotes(slide.number),
                fontSize: round(notesBase * 1.2),
                bold: true,
                color: PDF_INK.heading,
                margin: [0, 0, 0, notesBase],
            },
            ...slide.notes
                .map((block) => renderBlock(block, notesContext))
                .filter((item): item is Content => item !== null),
        ],
    });

    return items;
}

function buildSlidesDefinition(
    document: Extract<SourceDocument, { layout: "slides" }>,
    options: PdfConverterOptions,
    labels: PdfLabels,
): TDocumentDefinitions {
    const widthPt = emuToPoints(document.slideWidthEmu);
    const heightPt = emuToPoints(document.slideHeightEmu);
    const context: SlideContext = { options, labels, widthPt, heightPt };

    return {
        // The deck's own page, not the reader's. A slide is a fixed rectangle
        // with things placed on it; re-flowing one onto A4 would leave every
        // shape at the wrong coordinates or every page with bands of white down
        // two sides. The page-size control says so and is disabled for a deck.
        pageSize: { width: widthPt, height: heightPt },
        pageMargins: [0, 0, 0, 0],
        content: document.slides.flatMap((slide, index) => [...renderSlide(slide, index, context)]),
        defaultStyle: {
            font: "Roboto",
            fontSize: SLIDE_BODY_SIZE,
            color: PDF_INK.body,
            lineHeight: 1.25,
        },
    };
}

/* ------------------------------------------------------------------ entry --- */

export function buildDocDefinition(
    document: SourceDocument,
    options: PdfConverterOptions,
    labels: PdfLabels = DEFAULT_PDF_LABELS,
): TDocumentDefinitions {
    return document.layout === "slides"
        ? buildSlidesDefinition(document, options, labels)
        : buildFlowDefinition(document, options);
}

/** Two decimal places. A point is small; a float's tail is noise in a diff. */
function round(value: number): number {
    return Math.round(value * 100) / 100;
}
