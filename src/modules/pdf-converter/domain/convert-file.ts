import type { PdfConversionResult, PdfConverterOptions, SourceDocument } from "../types";
import { documentText } from "./blocks";
import { MAX_PDF_SOURCE_BYTES } from "./constants";
import { convertText, finishFlow } from "./convert";
import { readPackage } from "./package";
import { readDocx } from "./read-docx";
import { readPptx } from "./read-pptx";
import { readXlsx } from "./read-xlsx";
import { unsupportedScriptsIn } from "./scripts";
import {
    formatFromFilename,
    isLegacyOfficeExtension,
    isPackagedFormat,
    looksLikeLegacyOffice,
    looksLikeZip,
    packageFormatOf,
} from "./source-format";

/**
 * The half of the orchestrator that reads a picked file.
 *
 * Kept out of `convert.ts` on purpose: everything imported below — Mammoth, an
 * XML parser, an unzipper — exists to open an Open XML package, and a reader
 * who only ever pastes a README should not download any of it. The island
 * imports this module the first time a file is dropped.
 */

export type PdfFileRequest = {
    readonly filename: string;
    readonly bytes: Uint8Array;
    readonly options: PdfConverterOptions;
};

export async function convertFile(request: PdfFileRequest): Promise<PdfConversionResult> {
    const { filename, bytes, options } = request;

    if (bytes.length === 0) {
        return { ok: false, reason: "empty_source" };
    }

    if (bytes.length > MAX_PDF_SOURCE_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    // The bytes win over the name. A `.doc` renamed to `.docx` is still an OLE
    // compound file, and telling somebody to re-save it is advice they can act
    // on — unlike a ZIP reader's complaint about a missing directory record.
    if (looksLikeLegacyOffice(bytes) || isLegacyOfficeExtension(filename)) {
        return { ok: false, reason: "legacy_office_format" };
    }

    const claimed = formatFromFilename(filename);

    if (claimed === null) {
        return { ok: false, reason: "unknown_format" };
    }

    if (!isPackagedFormat(claimed)) {
        return convertText({
            format: claimed,
            text: new TextDecoder("utf-8").decode(bytes),
            options,
        });
    }

    if (!looksLikeZip(bytes)) {
        return { ok: false, reason: "not_a_package" };
    }

    const pkg = readPackage(bytes);

    if (pkg === null) {
        return { ok: false, reason: "not_a_package" };
    }

    const actual = packageFormatOf(pkg.names);

    if (actual === null) {
        return { ok: false, reason: "not_a_package" };
    }

    if (actual !== claimed) {
        return { ok: false, reason: "wrong_package", actualFormat: actual };
    }

    if (claimed === "docx") {
        const read = await readDocx(bytes, options);

        if (read === null) {
            return { ok: false, reason: "malformed_source" };
        }

        return finishFlow({
            format: "docx",
            blocks: read.blocks,
            title: read.title,
            droppedImageTypes: read.droppedImageTypes,
            truncated: [],
            strippedMdx: [],
        });
    }

    if (claimed === "xlsx") {
        const read = readXlsx(pkg, options);

        if (read === null) {
            return { ok: false, reason: "malformed_source" };
        }

        return finishFlow({
            format: "xlsx",
            blocks: read.blocks,
            title: read.title,
            droppedImageTypes: [],
            truncated: read.truncated,
            strippedMdx: [],
        });
    }

    const read = readPptx(pkg, options);

    if (read === null) {
        return { ok: false, reason: "malformed_source" };
    }

    if (read.empty) {
        return { ok: false, reason: "no_content" };
    }

    const document: SourceDocument = {
        layout: "slides",
        title: read.title,
        slides: read.slides,
        slideWidthEmu: read.slideWidthEmu,
        slideHeightEmu: read.slideHeightEmu,
    };

    return {
        ok: true,
        format: "pptx",
        document,
        notes: {
            droppedImageTypes: read.droppedImageTypes,
            truncated: read.truncated,
            unsupportedScripts: unsupportedScriptsIn(documentText(document)),
            strippedMdx: [],
        },
    };
}
