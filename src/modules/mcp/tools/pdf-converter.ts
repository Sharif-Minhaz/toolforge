import { join } from "node:path";
import { z } from "zod";

import { base64ToBytes, bytesToBase64 } from "@/modules/tools/domain/base64";
import { DEFAULT_PDF_OPTIONS, PDF_FONT_DIRECTORY } from "@/modules/pdf-converter/domain/constants";
import { convertText, describeDocument } from "@/modules/pdf-converter/domain/convert";
import { convertFile } from "@/modules/pdf-converter/domain/convert-file";
import { renderPdfBytes } from "@/modules/pdf-converter/domain/engine";
import { preparePdf } from "@/modules/pdf-converter/domain/prepare";
import { formatFromFilename, isPackagedFormat } from "@/modules/pdf-converter/domain/source-format";
import type { PdfPasteableFormat } from "@/modules/pdf-converter/types";
import {
    pdfMarginSchema,
    pdfOrientationSchema,
    pdfPageSizeSchema,
} from "@/modules/pdf-converter/validation/converter-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuse, refuseWithReason, succeed } from "../domain/result";

/**
 * Word, PowerPoint, Excel, HTML, Markdown and MDX to PDF, for a caller with no
 * browser.
 *
 * The tool qualifies for an adapter under `CLAUDE.md` rule 20 without an
 * argument: nothing in the pipeline needs a canvas, a worker, a cookie or
 * anybody's API budget. The layout engine runs on a server exactly as it runs in
 * a tab — `tests/engine.test.ts` drives that path under `bun test` — and the
 * only environment-specific piece is where the font files come from, which is
 * why `renderPdfBytes` takes a loader rather than owning one.
 *
 * Two bounds are this file's own rather than the tool's. The input is held well
 * under `MAX_MCP_BODY_BYTES`, because a base64 argument is four bytes of
 * envelope for every three of file. And the *output* is bounded too: a PDF that
 * came back as a megabyte of base64 would be a megabyte of somebody's context
 * window, so past the ceiling the call is refused by name and pointed at the
 * page, which hands over a file instead of a string.
 */

/** Decoded source bytes, not the base64 that carried them. */
const MAX_MCP_PDF_SOURCE_BYTES = 1_048_576;

/** The PDF itself, before base64 turns it into four thirds of that. */
const MAX_MCP_PDF_OUTPUT_BYTES = 1_572_864;

/**
 * Font packs come off the deployment's own disk.
 *
 * Imported lazily so `node:fs` never enters the module graph of anything that
 * merely lists the registry — the `/mcp` guide page reads `MCP_TOOLS` for its
 * table and has no business pulling in a file system to do it.
 */
async function loadFontFile(filename: string): Promise<Uint8Array> {
    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(
        join(process.cwd(), "public", PDF_FONT_DIRECTORY.replace(/^\//, ""), filename),
    );

    return new Uint8Array(buffer);
}

export const pdfConverterConvertTool = defineMcpTool({
    toolId: "pdf-converter",
    verb: "convert",
    title: "Convert a document to PDF",
    description:
        "Turn a Word (.docx), PowerPoint (.pptx), Excel (.xlsx), HTML, Markdown or MDX document into a PDF with real, selectable text — not a picture of the page. The format is taken from `filename`, so pass a real one. Office packages must arrive base64-encoded; the three text notations may be sent as plain text. Returns the PDF as base64 along with what was read and anything that had to be left out: pictures PDF cannot store, sheets or rows cut at a ceiling, and scripts there is no bundled font for (Latin, Greek, Cyrillic and Bengali are covered; CJK, Arabic, Hebrew, Devanagari and Thai are not).",
    kind: "offline",
    inputSchema: z.object({
        filename: z
            .string()
            .min(1)
            .max(255)
            .describe(
                "The document's name, including its extension — the extension is how the format is decided",
            ),
        content: z
            .string()
            .max(MAX_MCP_PDF_SOURCE_BYTES * 2)
            .describe("The document itself: base64 for .docx/.pptx/.xlsx, plain text otherwise"),
        encoding: z
            .enum(["utf-8", "base64"])
            .default("utf-8")
            .describe("How `content` is encoded. Office packages are always `base64`"),
        pageSize: pdfPageSizeSchema
            .default(DEFAULT_PDF_OPTIONS.pageSize)
            .describe("Ignored for a presentation, which brings its own page size"),
        orientation: pdfOrientationSchema
            .default(DEFAULT_PDF_OPTIONS.orientation)
            .describe("`auto` turns the page sideways for a wide table and leaves prose upright"),
        margin: pdfMarginSchema.default(DEFAULT_PDF_OPTIONS.margin).describe("Page margins"),
        fontSize: z
            .number()
            .int()
            .min(7)
            .max(18)
            .default(DEFAULT_PDF_OPTIONS.fontSize)
            .describe("Body size in points; headings and tables scale from it"),
        pageNumbers: z
            .boolean()
            .default(DEFAULT_PDF_OPTIONS.pageNumbers)
            .describe("A centred count in the bottom margin, or the slide number on a deck"),
        includeImages: z
            .boolean()
            .default(DEFAULT_PDF_OPTIONS.includeImages)
            .describe("Embed PNG and JPEG pictures. Anything else is dropped and reported"),
        showLinkUrls: z
            .boolean()
            .default(DEFAULT_PDF_OPTIONS.showLinkUrls)
            .describe("Write each link's address after its text, for a page that will be printed"),
        includeSpeakerNotes: z
            .boolean()
            .default(DEFAULT_PDF_OPTIONS.includeSpeakerNotes)
            .describe("Add a page of notes after each slide that has any. Presentations only"),
        repeatHeaderRow: z
            .boolean()
            .default(DEFAULT_PDF_OPTIONS.repeatHeaderRow)
            .describe("Repeat a table's first row on every page it continues onto"),
        separateSheets: z
            .boolean()
            .default(DEFAULT_PDF_OPTIONS.separateSheets)
            .describe("Start each sheet on its own page under its own name. Spreadsheets only"),
    }),
    run: async ({ filename, content, encoding, ...options }) => {
        const format = formatFromFilename(filename);

        if (format === null) {
            return refuseWithReason("PDF Converter", "unknown_format", {
                filename,
                readable: [".docx", ".pptx", ".xlsx", ".html", ".md", ".mdx"],
            });
        }

        if (isPackagedFormat(format) && encoding !== "base64") {
            // `reason` is repeated inside `data` on purpose: that is where
            // `refuseWithReason` puts it, and a client reading one refusal of
            // this tool should not have to read the next one differently.
            return refuse("binary_required", "An Office package has to be sent base64-encoded.", {
                reason: "binary_required",
                filename,
                format,
            });
        }

        const bytes = encoding === "base64" ? base64ToBytes(content) : null;

        if (encoding === "base64" && bytes === null) {
            return refuse("invalid_base64", "`content` is not valid base64.", {
                reason: "invalid_base64",
                filename,
            });
        }

        if (bytes !== null && bytes.length > MAX_MCP_PDF_SOURCE_BYTES) {
            return refuseWithReason("PDF Converter", "too_large", {
                bytes: bytes.length,
                limit: MAX_MCP_PDF_SOURCE_BYTES,
            });
        }

        // Every option is accepted for every format and the ones the format
        // cannot use are put back to their defaults inside `convertFile` and
        // `convertText`. A program has no panel to read, and refusing an
        // argument that is merely irrelevant makes the schema harder to call
        // rather than safer.
        const converted =
            bytes === null
                ? convertText({
                      format: format as PdfPasteableFormat,
                      text: content,
                      options: { ...DEFAULT_PDF_OPTIONS, ...options },
                  })
                : await convertFile({
                      filename,
                      bytes,
                      options: { ...DEFAULT_PDF_OPTIONS, ...options },
                  });

        if (!converted.ok) {
            return refuseWithReason("PDF Converter", converted.reason, {
                filename,
                ...(converted.actualFormat === undefined
                    ? {}
                    : { actualFormat: converted.actualFormat }),
            });
        }

        const prepared = preparePdf({
            document: converted.document,
            options: { ...DEFAULT_PDF_OPTIONS, ...options },
            sourceFilename: filename,
            // Only ever reaches the filename, and only when the document has no
            // name and no title of its own — which cannot happen here, because
            // `filename` is required. Named rather than omitted so the call
            // stays deterministic if that ever changes.
            generatedAt: new Date(0),
        });

        const rendered = await renderPdfBytes(prepared, loadFontFile);

        if (!rendered.ok) {
            return refuseWithReason("PDF Converter", rendered.reason, { filename });
        }

        if (rendered.bytes.length > MAX_MCP_PDF_OUTPUT_BYTES) {
            return refuse(
                "output_too_large",
                "The PDF is larger than this endpoint will return as base64.",
                {
                    reason: "output_too_large",
                    bytes: rendered.bytes.length,
                    limit: MAX_MCP_PDF_OUTPUT_BYTES,
                    page: "/tools/pdf-converter",
                },
            );
        }

        const summary = describeDocument(converted.document);

        return succeed(
            `Wrote ${prepared.filename} — ${rendered.bytes.length} bytes from a ${converted.format} document`,
            {
                filename: prepared.filename,
                format: converted.format,
                // Returned because an MCP caller has nowhere else to read it
                // from: a PDF is bytes, and the notes are the only account of
                // what did not make it into them.
                pdfBase64: bytesToBase64(rendered.bytes),
                byteLength: rendered.bytes.length,
                layout: summary.layout,
                units: summary.units,
                words: summary.words,
                tables: summary.tables,
                images: summary.images,
                droppedImageTypes: [...converted.notes.droppedImageTypes],
                truncated: converted.notes.truncated.map((entry) => ({ ...entry })),
                unsupportedScripts: [...converted.notes.unsupportedScripts],
                strippedMdx: [...converted.notes.strippedMdx],
            },
        );
    },
});
