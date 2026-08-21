import { describe, expect, test } from "bun:test";

import { runsToText } from "@/modules/pdf-converter/domain/blocks";
import { readPackage } from "@/modules/pdf-converter/domain/package";
import { readDocx } from "@/modules/pdf-converter/domain/read-docx";
import { readPptx } from "@/modules/pdf-converter/domain/read-pptx";
import { parseCellReference, readXlsx } from "@/modules/pdf-converter/domain/read-xlsx";
import type { DocBlock, SlideShape } from "@/modules/pdf-converter/types";

import { buildDocx, buildPptx, buildXlsx } from "./fixtures";

function open(bytes: Uint8Array) {
    const pkg = readPackage(bytes);

    if (pkg === null) {
        throw new Error("expected a readable package");
    }

    return pkg;
}

/* ------------------------------------------------------------------- docx --- */

describe("docx", () => {
    test("maps Word styles to heading levels and keeps run marks", async () => {
        const result = await readDocx(
            buildDocx([
                { text: "Report", style: "Heading 1" },
                { text: "Body text", bold: true },
            ]),
            { includeImages: true },
        );

        expect(result?.blocks[0]).toEqual({
            kind: "heading",
            level: 1,
            runs: [{ text: "Report" }],
        } satisfies DocBlock);
        expect(result?.title).toBe("Report");

        const paragraph = result?.blocks[1] as Extract<DocBlock, { kind: "paragraph" }>;

        expect(paragraph.runs[0].bold).toBe(true);
    });

    test("a package with no document part is refused rather than read as empty", async () => {
        expect(
            await readDocx(buildXlsx([{ name: "S", rows: [["a"]] }]), { includeImages: true }),
        ).toBe(null);
    });

    test("a document with no paragraphs reports itself empty", async () => {
        const result = await readDocx(buildDocx([]), { includeImages: true });

        expect(result?.empty).toBe(true);
    });
});

/* ------------------------------------------------------------------- xlsx --- */

describe("xlsx", () => {
    test("reads a reference back to a zero-based column and row", () => {
        expect(parseCellReference("A1")).toEqual({ column: 0, row: 0 });
        expect(parseCellReference("Z10")).toEqual({ column: 25, row: 9 });
        expect(parseCellReference("AA1")).toEqual({ column: 26, row: 0 });
        expect(parseCellReference("nope")).toBe(null);
    });

    test("first row becomes the header and the rest the body", () => {
        const result = readXlsx(
            open(
                buildXlsx([
                    {
                        name: "Sales",
                        rows: [
                            ["Region", "Total"],
                            ["North", 120],
                        ],
                    },
                ]),
            ),
            { separateSheets: false },
        );

        const table = result?.blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(table.head?.map((cell) => runsToText(cell.runs))).toEqual(["Region", "Total"]);
        expect(table.rows[0].map((cell) => runsToText(cell.runs))).toEqual(["North", "120"]);
    });

    test("a date column prints as a date rather than a serial", () => {
        const result = readXlsx(
            open(
                buildXlsx([
                    {
                        name: "Log",
                        rows: [["When"], [45_000]],
                        styleByColumn: { 0: 1 },
                    },
                ]),
            ),
            { separateSheets: false },
        );

        const table = result?.blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(runsToText(table.rows[0][0].runs)).toBe("2023-03-15");
    });

    test("a percentage column is not left as a fraction", () => {
        const result = readXlsx(
            open(buildXlsx([{ name: "Rates", rows: [["Rate"], [0.15]], styleByColumn: { 0: 2 } }])),
            { separateSheets: false },
        );

        const table = result?.blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(runsToText(table.rows[0][0].runs)).toBe("15%");
    });

    test("a sparse sheet keeps its columns under their own headings", () => {
        const result = readXlsx(
            open(
                buildXlsx([
                    {
                        name: "Gaps",
                        rows: [
                            ["A", "B", "C"],
                            [null, null, "third"],
                        ],
                    },
                ]),
            ),
            { separateSheets: false },
        );

        const table = result?.blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(table.rows[0].map((cell) => runsToText(cell.runs))).toEqual(["", "", "third"]);
    });

    test("a hidden sheet was hidden on purpose and stays out", () => {
        const result = readXlsx(
            open(
                buildXlsx([
                    { name: "Public", rows: [["shown"]] },
                    { name: "Working", rows: [["secret"]], hidden: true },
                ]),
            ),
            { separateSheets: true },
        );

        expect(JSON.stringify(result?.blocks)).not.toContain("secret");
        expect(JSON.stringify(result?.blocks)).toContain("Public");
    });

    test("separate sheets get a heading and a break between them, never a trailing one", () => {
        const result = readXlsx(
            open(
                buildXlsx([
                    { name: "One", rows: [["a"]] },
                    { name: "Two", rows: [["b"]] },
                ]),
            ),
            { separateSheets: true },
        );

        expect(result?.blocks.map((block) => block.kind)).toEqual([
            "heading",
            "table",
            "pageBreak",
            "heading",
            "table",
        ]);
    });

    test("a merge is carried as a span", () => {
        const result = readXlsx(
            open(
                buildXlsx([
                    {
                        name: "Merged",
                        rows: [
                            ["Q1", null, "Total"],
                            ["Jan", "Feb", "100"],
                        ],
                        merges: ["A1:B1"],
                    },
                ]),
            ),
            { separateSheets: false },
        );

        const table = result?.blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(table.head?.[0].colSpan).toBe(2);
    });

    test("a workbook with no readable sheet list is refused", () => {
        expect(readXlsx(open(buildDocx([{ text: "hi" }])), { separateSheets: true })).toBe(null);
    });
});

/* ------------------------------------------------------------------- pptx --- */

describe("pptx", () => {
    const INCH = 914_400;

    test("keeps a shape where the slide put it", () => {
        const result = readPptx(
            open(
                buildPptx([
                    {
                        shapes: [
                            {
                                kind: "text",
                                frame: { x: INCH, y: INCH / 2, cx: 4 * INCH, cy: INCH },
                                placeholder: { type: "title" },
                                paragraphs: [{ text: "Quarterly review", sizePt: 36 }],
                            },
                        ],
                    },
                ]),
            ),
            { includeImages: true, includeSpeakerNotes: false },
        );

        const shape = result?.slides[0].shapes[0] as Extract<SlideShape, { kind: "text" }>;

        expect(shape.frame).toEqual({
            xEmu: INCH,
            yEmu: INCH / 2,
            widthEmu: 4 * INCH,
            heightEmu: INCH,
        });
        expect(shape.placeholder).toBe("title");
        expect(shape.paragraphs[0].sizePt).toBe(36);
        expect(result?.title).toBe("Quarterly review");
    });

    test("a shape with no box of its own inherits the layout's", () => {
        const result = readPptx(
            open(
                buildPptx([
                    {
                        layoutFrames: {
                            "body:1": { x: 2 * INCH, y: INCH, cx: 6 * INCH, cy: INCH },
                        },
                        shapes: [
                            {
                                kind: "text",
                                placeholder: { type: "body", idx: "1" },
                                paragraphs: [{ text: "Inherited" }],
                            },
                        ],
                    },
                ]),
            ),
            { includeImages: true, includeSpeakerNotes: false },
        );

        expect(result?.slides[0].shapes[0].frame.xEmu).toBe(2 * INCH);
    });

    test("bullets are on by default and off when the deck says so", () => {
        const result = readPptx(
            open(
                buildPptx([
                    {
                        shapes: [
                            {
                                kind: "text",
                                frame: { x: 0, y: 0, cx: INCH, cy: INCH },
                                paragraphs: [
                                    { text: "bulleted" },
                                    { text: "plain", bulleted: false },
                                    { text: "nested", level: 1 },
                                ],
                            },
                        ],
                    },
                ]),
            ),
            { includeImages: true, includeSpeakerNotes: false },
        );

        const shape = result?.slides[0].shapes[0] as Extract<SlideShape, { kind: "text" }>;

        expect(shape.paragraphs.map((paragraph) => paragraph.bulleted)).toEqual([
            true,
            false,
            true,
        ]);
        expect(shape.paragraphs[2].level).toBe(1);
    });

    test("embeds a picture and keeps its box", () => {
        const result = readPptx(
            open(
                buildPptx([
                    {
                        shapes: [
                            {
                                kind: "picture",
                                frame: { x: 0, y: 0, cx: 2 * INCH, cy: INCH },
                                image: "image1.png",
                            },
                        ],
                    },
                ]),
            ),
            { includeImages: true, includeSpeakerNotes: false },
        );

        const shape = result?.slides[0].shapes[0] as Extract<SlideShape, { kind: "image" }>;

        expect(shape.kind).toBe("image");
        expect(shape.image.dataUri.startsWith("data:image/png;base64,")).toBe(true);
        expect(shape.image.alt).toBe("alt text");
    });

    test("pictures off leaves the text behind and nothing else", () => {
        const result = readPptx(
            open(
                buildPptx([
                    {
                        shapes: [
                            {
                                kind: "picture",
                                frame: { x: 0, y: 0, cx: INCH, cy: INCH },
                                image: "image1.png",
                            },
                            {
                                kind: "text",
                                frame: { x: 0, y: 0, cx: INCH, cy: INCH },
                                paragraphs: [{ text: "kept" }],
                            },
                        ],
                    },
                ]),
            ),
            { includeImages: false, includeSpeakerNotes: false },
        );

        expect(result?.slides[0].shapes.map((shape) => shape.kind)).toEqual(["text"]);
    });

    test("speaker notes are read only when asked for", () => {
        const deck = buildPptx([
            {
                notes: "Remember the third quarter",
                shapes: [
                    {
                        kind: "text",
                        frame: { x: 0, y: 0, cx: INCH, cy: INCH },
                        paragraphs: [{ text: "Slide" }],
                    },
                ],
            },
        ]);

        const without = readPptx(open(deck), { includeImages: true, includeSpeakerNotes: false });
        const with_ = readPptx(open(deck), { includeImages: true, includeSpeakerNotes: true });

        expect(without?.slides[0].notes).toEqual([]);
        expect(with_?.slides[0].notes).toEqual([
            { kind: "paragraph", runs: [{ text: "Remember the third quarter" }] },
        ]);
    });

    test("reads the deck's own page size", () => {
        const result = readPptx(
            open(buildPptx([{ shapes: [] }], { width: 9_144_000, height: 6_858_000 })),
            { includeImages: true, includeSpeakerNotes: false },
        );

        expect(result?.slideWidthEmu).toBe(9_144_000);
        expect(result?.slideHeightEmu).toBe(6_858_000);
    });

    test("a package with no slide list is refused", () => {
        expect(
            readPptx(open(buildDocx([{ text: "hi" }])), {
                includeImages: true,
                includeSpeakerNotes: false,
            }),
        ).toBe(null);
    });
});
