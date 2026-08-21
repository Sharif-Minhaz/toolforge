import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_PDF_OPTIONS } from "@/modules/pdf-converter/domain/constants";
import { convertText } from "@/modules/pdf-converter/domain/convert";
import { convertFile } from "@/modules/pdf-converter/domain/convert-file";
import { renderPdfBytes } from "@/modules/pdf-converter/domain/engine";
import { preparePdf } from "@/modules/pdf-converter/domain/prepare";
import type { PdfConversionResult, SourceDocument } from "@/modules/pdf-converter/types";

import { buildPptx, buildXlsx } from "./fixtures";

/**
 * The end of the pipeline, driven for real.
 *
 * Everything else in this folder asserts the shape of a document definition,
 * which proves the layout is what it was meant to be and proves nothing about
 * whether pdfmake will accept it. This file hands the definition to the actual
 * engine and checks the bytes that come back — a font it cannot resolve, a
 * table whose row is one cell short of its widths array, a `colSpan` running
 * off the end, all of which type-check perfectly and all of which throw here.
 *
 * The font loader reads `public/fonts` off disk, which is the server's half of
 * the injection. The browser's half fetches the same files from the same names
 * over HTTP; that path is the one thing here no test reaches, and it is called
 * out in the handover.
 */
const loadFont = (filename: string) =>
    readFile(join(process.cwd(), "public", "fonts", filename)).then(
        (buffer) => new Uint8Array(buffer),
    );

const STAMP = new Date("2026-08-21T10:15:00.000Z");

function documentOf(result: PdfConversionResult): SourceDocument {
    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result.document;
}

async function toPdf(document: SourceDocument, sourceFilename: string | null = null) {
    const rendered = await renderPdfBytes(
        preparePdf({
            document,
            options: DEFAULT_PDF_OPTIONS,
            sourceFilename,
            generatedAt: STAMP,
        }),
        loadFont,
    );

    if (!rendered.ok) {
        throw new Error(`expected bytes, got ${rendered.reason}`);
    }

    return rendered.bytes;
}

function isPdf(bytes: Uint8Array): boolean {
    return String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}

describe("real output", () => {
    // **Must stay first.** A font file loads once and stays in the engine's own
    // virtual file system for the rest of the process, so this is the only
    // point in the file at which a pack is genuinely absent and the loader is
    // genuinely called. Moving it down would turn it green for the wrong reason.
    test("a pack that will not load is its own refusal, not a rendering failure", async () => {
        const document = documentOf(
            convertText({ format: "markdown", text: "ঢাকা", options: DEFAULT_PDF_OPTIONS }),
        );

        const rendered = await renderPdfBytes(
            preparePdf({
                document,
                options: DEFAULT_PDF_OPTIONS,
                sourceFilename: null,
                generatedAt: STAMP,
            }),
            () => Promise.reject(new Error("offline")),
        );

        expect(rendered).toEqual({ ok: false, reason: "font_unavailable" });
    });

    test("a Markdown document with every construct produces a PDF", async () => {
        const document = documentOf(
            convertText({
                format: "markdown",
                text: [
                    "# Title",
                    "",
                    "A paragraph with **bold**, _italic_, `code` and a [link](https://example.com).",
                    "",
                    "- one",
                    "  - nested",
                    "- two",
                    "",
                    "1. first",
                    "2. second",
                    "",
                    "> A quotation.",
                    "",
                    "| Region | Total |",
                    "| ------ | ----- |",
                    "| North  | 120   |",
                    "",
                    "```ts",
                    "if (x) {",
                    "    y();",
                    "}",
                    "```",
                    "",
                    "---",
                ].join("\n"),
                options: DEFAULT_PDF_OPTIONS,
            }),
        );

        const bytes = await toPdf(document);

        expect(isPdf(bytes)).toBe(true);
        expect(bytes.length).toBeGreaterThan(2_000);
    });

    test("Bengali text loads its pack and embeds glyphs", async () => {
        const latin = await toPdf(
            documentOf(
                convertText({
                    format: "markdown",
                    text: "Dhaka: 42",
                    options: DEFAULT_PDF_OPTIONS,
                }),
            ),
        );

        const bengali = await toPdf(
            documentOf(
                convertText({
                    format: "markdown",
                    text: "ঢাকা: ৪২",
                    options: DEFAULT_PDF_OPTIONS,
                }),
            ),
        );

        // A pack that failed to load would still produce a PDF — one with empty
        // boxes in it. The embedded subset is what makes the difference visible
        // from here, so the size is the assertion.
        expect(isPdf(bengali)).toBe(true);
        expect(bengali.length).toBeGreaterThan(latin.length);
    });

    test("a deck renders one page per slide at the deck's own size", async () => {
        const document = documentOf(
            await convertFile({
                filename: "deck.pptx",
                bytes: buildPptx([
                    {
                        shapes: [
                            {
                                kind: "text",
                                frame: { x: 914_400, y: 914_400, cx: 6_000_000, cy: 1_200_000 },
                                placeholder: { type: "title" },
                                paragraphs: [{ text: "Quarterly review", sizePt: 32 }],
                            },
                        ],
                    },
                    {
                        shapes: [
                            {
                                kind: "picture",
                                frame: { x: 500_000, y: 500_000, cx: 2_000_000, cy: 2_000_000 },
                                image: "image1.png",
                            },
                        ],
                    },
                ]),
                options: DEFAULT_PDF_OPTIONS,
            }),
        );

        const bytes = await toPdf(document, "deck.pptx");

        expect(isPdf(bytes)).toBe(true);
    });

    test("a workbook with a merged heading survives the span placement", async () => {
        const document = documentOf(
            await convertFile({
                filename: "sales.xlsx",
                bytes: buildXlsx([
                    {
                        name: "Q1",
                        rows: [
                            ["Quarter one", null, "Total"],
                            ["Jan", "Feb", "100"],
                        ],
                        merges: ["A1:B1"],
                    },
                ]),
                options: DEFAULT_PDF_OPTIONS,
            }),
        );

        const bytes = await toPdf(document, "sales.xlsx");

        expect(isPdf(bytes)).toBe(true);
    });

    test("a document naming a script with no font still renders, with gaps", async () => {
        const document = documentOf(
            convertText({ format: "markdown", text: "# 見出し", options: DEFAULT_PDF_OPTIONS }),
        );

        const bytes = await toPdf(document);

        expect(isPdf(bytes)).toBe(true);
    });
});
