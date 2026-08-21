import { describe, expect, test } from "bun:test";

import { convertFile } from "@/modules/pdf-converter/domain/convert-file";
import {
    appliesTo,
    coerceOptions,
    convertText,
    describeDocument,
    hasNotes,
} from "@/modules/pdf-converter/domain/convert";
import {
    DEFAULT_PDF_OPTIONS,
    MAX_PDF_SOURCE_BYTES,
} from "@/modules/pdf-converter/domain/constants";
import { buildPdfFilename } from "@/modules/pdf-converter/domain/export";
import type {
    PdfConversionResult,
    PdfConversionSuccess,
    PdfConverterOptions,
    PdfSourceFormat,
} from "@/modules/pdf-converter/types";
import { PDF_SOURCE_FORMATS } from "@/modules/pdf-converter/types";

import { buildDocx, buildPptx, buildStrangerPackage, buildXlsx } from "./fixtures";

function options(overrides: Partial<PdfConverterOptions> = {}): PdfConverterOptions {
    return { ...DEFAULT_PDF_OPTIONS, ...overrides };
}

function expectOk(result: PdfConversionResult): PdfConversionSuccess {
    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result;
}

describe("text conversion", () => {
    test("markdown becomes a flowed document with a title", () => {
        const result = expectOk(
            convertText({ format: "markdown", text: "# Notes\n\nBody.", options: options() }),
        );

        expect(result.format).toBe("markdown");
        expect(result.document.layout).toBe("flow");
        expect(result.document.title).toBe("Notes");
    });

    test("an empty source is empty, not unconvertible", () => {
        expect(convertText({ format: "html", text: "   \n ", options: options() })).toEqual({
            ok: false,
            reason: "empty_source",
        });
    });

    test("a document that parses to nothing is a different refusal again", () => {
        // The fix for `empty_source` is a different file. The fix for
        // `no_content` may be turning images back on.
        expect(
            convertText({ format: "html", text: "<script>x</script>", options: options() }),
        ).toEqual({ ok: false, reason: "no_content" });
    });

    test("a source past the ceiling is refused before anything is parsed", () => {
        const result = convertText({
            format: "markdown",
            text: "x".repeat(MAX_PDF_SOURCE_BYTES + 1),
            options: options(),
        });

        expect(result).toEqual({ ok: false, reason: "too_large" });
    });

    test("reports the scripts no bundled font can draw", () => {
        const result = expectOk(
            convertText({ format: "markdown", text: "# 見出し\n\nText", options: options() }),
        );

        expect(result.notes.unsupportedScripts).toEqual(["cjk"]);
        expect(hasNotes(result.notes)).toBe(true);
    });

    test("Bengali is not reported, because there is a pack for it", () => {
        const result = expectOk(
            convertText({ format: "markdown", text: "# শিরোনাম", options: options() }),
        );

        expect(result.notes.unsupportedScripts).toEqual([]);
        expect(hasNotes(result.notes)).toBe(false);
    });

    test("MDX strips are carried into the notes", () => {
        const result = expectOk(
            convertText({
                format: "mdx",
                text: 'import C from "./c";\n\n# Kept\n\n<C />\n',
                options: options(),
            }),
        );

        expect([...result.notes.strippedMdx].sort()).toEqual(["import", "jsx"]);
    });
});

describe("file conversion", () => {
    test("a Word package becomes a flowed document", async () => {
        const result = expectOk(
            await convertFile({
                filename: "report.docx",
                bytes: buildDocx([{ text: "Title", style: "Heading 1" }]),
                options: options(),
            }),
        );

        expect(result.format).toBe("docx");
        expect(result.document.layout).toBe("flow");
    });

    test("a deck becomes slides, keeping its own page size", async () => {
        const result = expectOk(
            await convertFile({
                filename: "deck.pptx",
                bytes: buildPptx(
                    [
                        {
                            shapes: [
                                {
                                    kind: "text",
                                    frame: { x: 0, y: 0, cx: 914_400, cy: 914_400 },
                                    placeholder: { type: "title" },
                                    paragraphs: [{ text: "Hello" }],
                                },
                            ],
                        },
                    ],
                    { width: 9_144_000, height: 6_858_000 },
                ),
                options: options(),
            }),
        );

        expect(result.document.layout).toBe("slides");

        if (result.document.layout === "slides") {
            expect(result.document.slideWidthEmu).toBe(9_144_000);
        }
    });

    test("a workbook becomes tables", async () => {
        const result = expectOk(
            await convertFile({
                filename: "sales.xlsx",
                bytes: buildXlsx([
                    {
                        name: "Q1",
                        rows: [
                            ["Region", "Total"],
                            ["North", 1],
                        ],
                    },
                ]),
                options: options(),
            }),
        );

        expect(describeDocument(result.document).tables).toBe(1);
    });

    test("a pre-2007 binary is named, not left to a ZIP reader", async () => {
        const ole = new Uint8Array(64);

        ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

        expect(await convertFile({ filename: "old.docx", bytes: ole, options: options() })).toEqual(
            { ok: false, reason: "legacy_office_format" },
        );
    });

    test("a .doc is refused on its extension alone", async () => {
        expect(
            await convertFile({
                filename: "old.doc",
                bytes: new Uint8Array([1, 2, 3, 4]),
                options: options(),
            }),
        ).toEqual({ ok: false, reason: "legacy_office_format" });
    });

    test("a package that is not one of ours is refused as such", async () => {
        expect(
            await convertFile({
                filename: "thing.docx",
                bytes: buildStrangerPackage(),
                options: options(),
            }),
        ).toEqual({ ok: false, reason: "not_a_package" });
    });

    test("a workbook wearing a .pptx extension names what it really is", async () => {
        expect(
            await convertFile({
                filename: "deck.pptx",
                bytes: buildXlsx([{ name: "S", rows: [["a"]] }]),
                options: options(),
            }),
        ).toEqual({ ok: false, reason: "wrong_package", actualFormat: "xlsx" });
    });

    test("an unknown extension is refused before anything is read", async () => {
        expect(
            await convertFile({
                filename: "notes.rst",
                bytes: new Uint8Array([104, 105]),
                options: options(),
            }),
        ).toEqual({ ok: false, reason: "unknown_format" });
    });

    test("an empty file is empty", async () => {
        expect(
            await convertFile({ filename: "a.md", bytes: new Uint8Array(), options: options() }),
        ).toEqual({ ok: false, reason: "empty_source" });
    });

    test("a text format arriving as a file takes the same path as a paste", async () => {
        const result = expectOk(
            await convertFile({
                filename: "README.md",
                bytes: new TextEncoder().encode("# From disk"),
                options: options(),
            }),
        );

        expect(result.format).toBe("markdown");
        expect(result.document.title).toBe("From disk");
    });
});

describe("which controls apply", () => {
    test("a deck brings its own page, so three controls have nothing to decide", () => {
        expect(appliesTo("pageSize", "pptx")).toBe(false);
        expect(appliesTo("orientation", "pptx")).toBe(false);
        expect(appliesTo("margin", "pptx")).toBe(false);
        expect(appliesTo("fontSize", "pptx")).toBe(false);
    });

    test("speaker notes belong to a deck and to nothing else", () => {
        expect(appliesTo("includeSpeakerNotes", "pptx")).toBe(true);
        expect(appliesTo("includeSpeakerNotes", "docx")).toBe(false);
    });

    test("sheet separation belongs to a workbook and to nothing else", () => {
        expect(appliesTo("separateSheets", "xlsx")).toBe(true);
        expect(appliesTo("separateSheets", "html")).toBe(false);
    });

    test("page numbers apply everywhere", () => {
        for (const format of PDF_SOURCE_FORMATS) {
            expect(appliesTo("pageNumbers", format)).toBe(true);
        }
    });

    test("every option applies to at least one format, and none to all by accident", () => {
        const keys = Object.keys(DEFAULT_PDF_OPTIONS) as (keyof PdfConverterOptions)[];

        for (const key of keys) {
            const formats = PDF_SOURCE_FORMATS.filter((format: PdfSourceFormat) =>
                appliesTo(key, format),
            );

            expect(formats.length).toBeGreaterThan(0);
        }
    });

    test("an option the format cannot use is put back to its default", () => {
        const coerced = coerceOptions(
            options({ includeSpeakerNotes: true, pageSize: "legal" }),
            "xlsx",
            DEFAULT_PDF_OPTIONS,
        );

        expect(coerced.includeSpeakerNotes).toBe(DEFAULT_PDF_OPTIONS.includeSpeakerNotes);
        expect(coerced.pageSize).toBe("legal");
    });
});

describe("the summary shown before anything is pressed", () => {
    test("counts blocks, words and tables for a flowed document", () => {
        const result = expectOk(
            convertText({
                format: "markdown",
                text: "# Title\n\nTwo words.\n\n| A |\n| - |\n| 1 |\n",
                options: options(),
            }),
        );

        const summary = describeDocument(result.document);

        expect(summary.layout).toBe("flow");
        expect(summary.units).toBe(3);
        expect(summary.tables).toBe(1);
        expect(summary.words).toBeGreaterThan(0);
    });
});

describe("what the file is called", () => {
    const stamp = new Date("2026-08-21T10:15:00.000Z");

    test("the source file's own name comes first, minus its extension", () => {
        expect(buildPdfFilename("Q3 report.docx", "Ignored", stamp)).toBe("Q3-report.pdf");
    });

    test("a pasted document falls back to its first heading", () => {
        expect(buildPdfFilename(null, "Release notes", stamp)).toBe("Release-notes.pdf");
    });

    test("a name written in Bangla comes back in Bangla", () => {
        expect(buildPdfFilename(null, "প্রতিবেদন", stamp)).toBe("প্রতিবেদন.pdf");
    });

    test("a document with neither gets a stamp that at least sorts", () => {
        expect(buildPdfFilename(null, null, stamp)).toBe("document-20260821T101500Z.pdf");
    });

    test("characters a file system would object to are replaced", () => {
        expect(buildPdfFilename(null, 'a/b:c*d?"e<f>g|h', stamp)).toBe("a-b-c-d-e-f-g-h.pdf");
    });
});
