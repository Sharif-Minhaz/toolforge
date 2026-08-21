import type { CustomTableLayout, TDocumentDefinitions } from "pdfmake/interfaces";

import type { PdfConverterOptions, PdfFontFamily, SourceDocument } from "../types";
import { buildPdfFilename } from "./export";
import { requiredFontFamilies } from "./font-runs";
import { buildFontDeclarations, packsToLoad, type FontDeclaration } from "./font-registry";
import { buildDocDefinition, type PdfLabels } from "./render";
import { createTableLayouts } from "./table-layouts";

/**
 * Everything the engine needs, worked out without touching one.
 *
 * The two callers that turn a document into bytes — the browser island and the
 * MCP adapter — differ in exactly two places, and both of them are about
 * loading files rather than about laying out a page:
 *
 * | Where   | Font bytes come from | Registered with                     |
 * | ------- | -------------------- | ----------------------------------- |
 * | Browser | `fetch("/fonts/…")`  | `pdfMake.addVirtualFileSystem`      |
 * | Node    | the file system      | `pdfMake.virtualfs.writeFileSync`   |
 *
 * Those two methods do not both exist on both builds, which is the same
 * `browser` field divergence Mammoth has and Turndown had. So neither is named
 * here. This function answers *what* has to be loaded and *what* the document
 * is; the twenty lines that know how to load it live on each side, where the
 * environment is not in question.
 */

export type PdfPreparation = {
    readonly definition: TDocumentDefinitions;
    /** The `fonts` table, covering exactly the families this document uses. */
    readonly fonts: Record<string, FontDeclaration>;
    readonly layouts: Record<string, CustomTableLayout>;
    /** Families whose files are not already inside pdfmake and must be loaded. */
    readonly packs: readonly PdfFontFamily[];
    readonly filename: string;
};

export type PdfPreparationRequest = {
    readonly document: SourceDocument;
    readonly options: PdfConverterOptions;
    /** The picked file's name, or `null` when the document was pasted. */
    readonly sourceFilename: string | null;
    /** Injected, so a test and a second call in the same second agree. */
    readonly generatedAt: Date;
    /**
     * Copy the document itself carries — currently only a speaker-notes
     * heading. Omitted falls back to English, which is what an MCP caller with
     * no locale of its own gets.
     */
    readonly labels?: PdfLabels;
};

export function preparePdf(request: PdfPreparationRequest): PdfPreparation {
    const families = requiredFontFamilies(request.document);

    return {
        definition: buildDocDefinition(request.document, request.options, request.labels),
        fonts: buildFontDeclarations(families),
        layouts: createTableLayouts(),
        packs: packsToLoad(families),
        filename: buildPdfFilename(
            request.sourceFilename,
            request.document.title,
            request.generatedAt,
        ),
    };
}
