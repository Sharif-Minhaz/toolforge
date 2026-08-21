import { describe, expect, test } from "bun:test";
import type { Content, ContentText } from "pdfmake/interfaces";

import { DEFAULT_PDF_OPTIONS } from "@/modules/pdf-converter/domain/constants";
import {
    LANDSCAPE_COLUMN_THRESHOLD,
    resolveOrientation,
} from "@/modules/pdf-converter/domain/page";
import { buildDocDefinition, PDF_INK } from "@/modules/pdf-converter/domain/render";
import type {
    DocBlock,
    PdfConverterOptions,
    SourceDocument,
    TableCell,
} from "@/modules/pdf-converter/types";

function options(overrides: Partial<PdfConverterOptions> = {}): PdfConverterOptions {
    return { ...DEFAULT_PDF_OPTIONS, ...overrides };
}

function flow(blocks: readonly DocBlock[]): SourceDocument {
    return { layout: "flow", title: null, blocks };
}

function content(document: SourceDocument, overrides: Partial<PdfConverterOptions> = {}) {
    const definition = buildDocDefinition(document, options(overrides));

    return definition.content as Content[];
}

function cell(text: string): TableCell {
    return { runs: [{ text }] };
}

describe("page geometry", () => {
    test("A4 portrait is the default page", () => {
        const definition = buildDocDefinition(
            flow([{ kind: "paragraph", runs: [{ text: "hi" }] }]),
            options(),
        );

        expect(definition.pageSize).toEqual({ width: 595.28, height: 841.89 });
    });

    test("landscape swaps the pair rather than naming a second size", () => {
        const definition = buildDocDefinition(
            flow([{ kind: "paragraph", runs: [{ text: "hi" }] }]),
            options({ orientation: "landscape" }),
        );

        expect(definition.pageSize).toEqual({ width: 841.89, height: 595.28 });
    });

    test("auto asks the document, not the reader", () => {
        const narrow = flow([{ kind: "paragraph", runs: [{ text: "prose" }] }]);
        const wide = flow([
            {
                kind: "table",
                head: Array.from({ length: LANDSCAPE_COLUMN_THRESHOLD }, (_, index) =>
                    cell(`c${index}`),
                ),
                rows: [],
                caption: null,
            },
        ]);

        expect(resolveOrientation("auto", narrow)).toBe("portrait");
        expect(resolveOrientation("auto", wide)).toBe("landscape");
    });

    test("a deck's page is the deck's own, in points", () => {
        const definition = buildDocDefinition(
            {
                layout: "slides",
                title: null,
                slideWidthEmu: 12_192_000,
                slideHeightEmu: 6_858_000,
                slides: [{ number: 1, shapes: [], notes: [] }],
            },
            options({ pageSize: "legal" }),
        );

        expect(definition.pageSize).toEqual({ width: 960, height: 540 });
        expect(definition.pageMargins).toEqual([0, 0, 0, 0]);
    });
});

describe("runs", () => {
    test("splits a mixed-script run so each piece names a font that can draw it", () => {
        const [paragraph] = content(flow([{ kind: "paragraph", runs: [{ text: "ঢাকা: 12" }] }]));
        const pieces = (paragraph as { text: ContentText[] }).text;

        expect(pieces.map((piece) => piece.font)).toEqual(["NotoSansBengali", "Roboto"]);
    });

    test("an inline code run takes the monospace family and a smaller size", () => {
        const [paragraph] = content(
            flow([{ kind: "paragraph", runs: [{ text: "npm i", code: true }] }]),
        );
        const [piece] = (paragraph as { text: ContentText[] }).text;

        expect(piece.font).toBe("RobotoMono");
        expect(piece.fontSize).toBeLessThan(DEFAULT_PDF_OPTIONS.fontSize);
    });

    test("a link is coloured and underlined", () => {
        const [paragraph] = content(
            flow([{ kind: "paragraph", runs: [{ text: "docs", link: "https://example.com" }] }]),
        );
        const [piece] = (paragraph as { text: ContentText[] }).text;

        expect(piece.link).toBe("https://example.com");
        expect(piece.color).toBe(PDF_INK.link);
        expect(piece.decoration).toBe("underline");
    });

    test("printing addresses adds one, but never after a bare URL", () => {
        const [named] = content(
            flow([{ kind: "paragraph", runs: [{ text: "docs", link: "https://example.com" }] }]),
            { showLinkUrls: true },
        );
        const [bare] = content(
            flow([
                {
                    kind: "paragraph",
                    runs: [{ text: "https://example.com", link: "https://example.com" }],
                },
            ]),
            { showLinkUrls: true },
        );

        expect((named as { text: ContentText[] }).text).toHaveLength(2);
        expect((bare as { text: ContentText[] }).text).toHaveLength(1);
    });

    test("underline and strikethrough together become both decorations", () => {
        const [paragraph] = content(
            flow([{ kind: "paragraph", runs: [{ text: "x", underline: true, strike: true }] }]),
        );
        const [piece] = (paragraph as { text: ContentText[] }).text;

        expect(piece.decoration).toEqual(["underline", "lineThrough"]);
    });
});

describe("blocks", () => {
    test("headings scale from the body size the reader chose", () => {
        const [heading] = content(
            flow([{ kind: "heading", level: 1, runs: [{ text: "Title" }] }]),
            { fontSize: 10 },
        );

        expect((heading as { fontSize: number }).fontSize).toBe(19);
    });

    test("a flattened list is nested again, so an inner list counts from one", () => {
        const [list] = content(
            flow([
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        { level: 0, runs: [{ text: "one" }] },
                        { level: 1, runs: [{ text: "inner" }] },
                        { level: 0, runs: [{ text: "two" }] },
                    ],
                },
            ]),
        );

        const outer = (list as { ol: Content[] }).ol;

        expect(outer).toHaveLength(3);
        expect(outer[1]).toHaveProperty("ol");
    });

    test("a code block goes in a filled box with its indentation kept", () => {
        const [code] = content(flow([{ kind: "code", text: "  indented" }]));
        const table = code as { table: { body: ContentText[][] }; layout: string };

        expect(table.layout).toBe("toolforgeCode");
        expect(table.table.body[0][0].preserveLeadingSpaces).toBe(true);
        expect(table.table.body[0][0].font).toBe("RobotoMono");
    });

    test("a table's header repeats only when the reader asked", () => {
        const block: DocBlock = {
            kind: "table",
            head: [cell("A")],
            rows: [[cell("1")]],
            caption: null,
        };

        const [repeated] = content(flow([block]), { repeatHeaderRow: true });
        const [once] = content(flow([block]), { repeatHeaderRow: false });

        expect((repeated as { table: { headerRows: number } }).table.headerRows).toBe(1);
        expect((once as { table: { headerRows: number } }).table.headerRows).toBe(0);
    });

    test("a spanned position becomes the empty object pdfmake reads as spanned", () => {
        const [table] = content(
            flow([
                {
                    kind: "table",
                    head: null,
                    rows: [[{ runs: [{ text: "wide" }], colSpan: 2 }], [cell("a"), cell("b")]],
                    caption: null,
                },
            ]),
        );

        const body = (table as { table: { body: unknown[][] } }).table.body;

        expect(body[0][1]).toEqual({});
    });

    test("a picture is fitted rather than stretched", () => {
        const [image] = content(
            flow([
                {
                    kind: "image",
                    image: {
                        dataUri: "data:image/png;base64,AA",
                        widthPx: null,
                        heightPx: null,
                        alt: null,
                    },
                },
            ]),
        );

        expect(image).toHaveProperty("fit");
        expect(image).not.toHaveProperty("width");
    });

    test("a page break is a break and nothing else", () => {
        expect(content(flow([{ kind: "pageBreak" }]))).toEqual([{ text: "", pageBreak: "before" }]);
    });
});

describe("slides", () => {
    const slideDocument: SourceDocument = {
        layout: "slides",
        title: null,
        slideWidthEmu: 12_192_000,
        slideHeightEmu: 6_858_000,
        slides: [
            {
                number: 1,
                shapes: [
                    {
                        kind: "text",
                        frame: {
                            xEmu: 914_400,
                            yEmu: 914_400,
                            widthEmu: 4_572_000,
                            heightEmu: 914_400,
                        },
                        placeholder: "title",
                        paragraphs: [
                            {
                                level: 0,
                                bulleted: false,
                                align: "left",
                                sizePt: 32,
                                runs: [{ text: "Title" }],
                            },
                        ],
                    },
                ],
                notes: [],
            },
            { number: 2, shapes: [], notes: [] },
        ],
    };

    test("a shape keeps its coordinates, converted to points", () => {
        const items = content(slideDocument);
        const placed = items.find((item) => "absolutePosition" in (item as object)) as {
            absolutePosition: { x: number; y: number };
            columns: { width: number }[];
        };

        expect(placed.absolutePosition).toEqual({ x: 72, y: 72 });
        expect(placed.columns[0].width).toBe(360);
    });

    test("each slide after the first starts a page", () => {
        const items = content(slideDocument, { pageNumbers: false });
        const breaks = items.filter(
            (item) => (item as { pageBreak?: string }).pageBreak === "before",
        );

        expect(breaks).toHaveLength(1);
    });

    test("speaker notes land on a page of their own", () => {
        const withNotes: SourceDocument = {
            ...slideDocument,
            slides: [
                {
                    ...slideDocument.slides[0],
                    notes: [{ kind: "paragraph", runs: [{ text: "Say this" }] }],
                },
            ],
        } as SourceDocument;

        const items = content(withNotes, { includeSpeakerNotes: true, pageNumbers: false });
        const notes = items.find(
            (item) => "stack" in (item as object) && "margin" in (item as object),
        );

        expect(notes).toHaveProperty("pageBreak", "before");
    });
});
