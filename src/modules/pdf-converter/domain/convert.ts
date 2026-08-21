import { getByteLength } from "@/modules/tools/domain/byte-size";

import type {
    DocBlock,
    PdfConversionNotes,
    PdfConversionResult,
    PdfConverterOptions,
    PdfPasteableFormat,
    PdfSourceFormat,
    PdfTruncation,
    SourceDocument,
} from "../types";
import { blocksText, documentText, firstHeadingText } from "./blocks";
import { MAX_PDF_BLOCKS, MAX_PDF_SOURCE_BYTES, MAX_PDF_TEXT_LENGTH } from "./constants";
import { readHtml } from "./read-html";
import { readMarkdown } from "./read-markdown";
import { unsupportedScriptsIn } from "./scripts";

/**
 * The half of the orchestrator that reads text, and the pieces both halves share.
 *
 * The split into two files is a bundle decision with a behavioural consequence,
 * so it is worth stating. `convertText` is **pure and synchronous** and pulls in
 * only Marked and an HTML parser, which is what lets the page convert a pasted
 * document on the server and the island re-derive it during render — the shape
 * the Base64 tool uses, and the one that puts a result in the first paint.
 *
 * `convert-file.ts` beside it drags in Mammoth, an XML parser and an unzipper —
 * together far more than a page whose reader only ever pastes a README should
 * have to download. It is imported the moment a file is picked and not before.
 *
 * Both halves produce the same `SourceDocument` and the same notes, so
 * everything downstream — the renderer, the summary, the MCP adapter — has one
 * shape to read rather than six.
 */

/**
 * Which controls the reader is actually looking at.
 *
 * Nine options and six formats, and most pairs are meaningless: a deck has no
 * page size to choose because the page *is* the slide, and a workbook has no
 * links to print. One predicate rather than a table per surface, so the panel
 * that disables a control, the article that documents it and the tests that
 * assert it cannot drift apart.
 */
export function appliesTo(option: keyof PdfConverterOptions, format: PdfSourceFormat): boolean {
    const slides = format === "pptx";
    const sheet = format === "xlsx";

    switch (option) {
        // A slide is a fixed rectangle with things placed on it. Re-flowing one
        // onto A4 would leave every shape at the wrong coordinates, so the deck
        // brings its own page and these three have nothing to decide.
        case "pageSize":
        case "orientation":
        case "margin":
        case "fontSize":
            return !slides;

        case "pageNumbers":
            return true;

        case "includeImages":
            // Nothing here reads pictures out of a workbook: a chart is a
            // drawing part rather than an image, and there is no way to draw one.
            return !sheet;

        case "showLinkUrls":
            return !sheet;

        case "includeSpeakerNotes":
            return slides;

        case "repeatHeaderRow":
            return !slides;

        case "separateSheets":
            return sheet;

        default:
            return true;
    }
}

/**
 * Options with everything the format cannot use put back to its default.
 *
 * A shared link naming an option the chosen format has no use for should open
 * on a working page rather than an error, and an MCP caller that passes
 * `includeSpeakerNotes` with a spreadsheet should get a spreadsheet rather than
 * a refusal. Coercion is the same answer in both places.
 */
export function coerceOptions(
    options: PdfConverterOptions,
    format: PdfSourceFormat,
    defaults: PdfConverterOptions,
): PdfConverterOptions {
    const coerced = { ...options };

    for (const key of Object.keys(options) as (keyof PdfConverterOptions)[]) {
        if (!appliesTo(key, format)) {
            Object.assign(coerced, { [key]: defaults[key] });
        }
    }

    return coerced;
}

/* ------------------------------------------------------------------- text --- */

export type PdfTextRequest = {
    readonly format: PdfPasteableFormat;
    readonly text: string;
    readonly options: PdfConverterOptions;
};

export function convertText(request: PdfTextRequest): PdfConversionResult {
    const { format, text, options } = request;

    if (text.trim().length === 0) {
        return { ok: false, reason: "empty_source" };
    }

    if (text.length > MAX_PDF_TEXT_LENGTH || getByteLength(text) > MAX_PDF_SOURCE_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    const read =
        format === "html"
            ? { ...readHtml(text, options), title: null, strippedMdx: [] as const }
            : readMarkdown(text, { ...options, mdx: format === "mdx" });

    return finishFlow({
        format,
        blocks: read.blocks,
        title: read.title ?? firstHeadingText(read.blocks),
        droppedImageTypes: read.droppedImageTypes,
        truncated: [],
        strippedMdx: read.strippedMdx,
    });
}

/* ----------------------------------------------------------------- shared --- */

export type FlowInput = {
    readonly format: PdfSourceFormat;
    readonly blocks: readonly DocBlock[];
    readonly title: string | null;
    readonly droppedImageTypes: readonly string[];
    readonly truncated: readonly PdfTruncation[];
    readonly strippedMdx: PdfConversionNotes["strippedMdx"];
};

export function finishFlow(input: FlowInput): PdfConversionResult {
    if (input.blocks.length === 0) {
        return { ok: false, reason: "no_content" };
    }

    if (input.blocks.length > MAX_PDF_BLOCKS) {
        return { ok: false, reason: "too_many_blocks" };
    }

    return {
        ok: true,
        format: input.format,
        document: { layout: "flow", title: input.title, blocks: input.blocks },
        notes: {
            droppedImageTypes: input.droppedImageTypes,
            truncated: input.truncated,
            unsupportedScripts: unsupportedScriptsIn(blocksText(input.blocks)),
            strippedMdx: input.strippedMdx,
        },
    };
}

/* --------------------------------------------------------------- describe --- */

export type DocumentSummary = {
    readonly layout: "flow" | "slides";
    /** Blocks for a flowed document, slides for a deck. */
    readonly units: number;
    readonly words: number;
    readonly tables: number;
    readonly images: number;
};

/**
 * What the reader is told before pressing anything.
 *
 * A conversion that only ever produces a file is a conversion nobody can check
 * — so the panel says how much came out of the document *before* the PDF is
 * built, which is also the moment a wrong format or an empty sheet is cheapest
 * to notice.
 */
export function describeDocument(document: SourceDocument): DocumentSummary {
    if (document.layout === "slides") {
        const shapes = document.slides.flatMap((slide) => slide.shapes);

        return {
            layout: "slides",
            units: document.slides.length,
            words: countWords(documentText(document)),
            tables: shapes.filter((shape) => shape.kind === "table").length,
            images: shapes.filter((shape) => shape.kind === "image").length,
        };
    }

    return {
        layout: "flow",
        units: document.blocks.length,
        words: countWords(documentText(document)),
        tables: document.blocks.filter((block) => block.kind === "table").length,
        images: document.blocks.filter((block) => block.kind === "image").length,
    };
}

function countWords(text: string): number {
    const trimmed = text.trim();

    return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/** True when a document carried anything the reader ought to be told about. */
export function hasNotes(notes: PdfConversionNotes): boolean {
    return (
        notes.droppedImageTypes.length > 0 ||
        notes.truncated.length > 0 ||
        notes.unsupportedScripts.length > 0 ||
        notes.strippedMdx.length > 0
    );
}
