import type { PdfSourceFormat } from "../types";

/**
 * Working out what a file is, from its name and then from its first bytes.
 *
 * Both, in that order, because neither alone is enough. An extension is what
 * the reader believes and is usually right; the bytes are what the file
 * actually is and cannot be renamed. Where they disagree the bytes win, and the
 * refusal names what the file turned out to be — `wrong_package` carries the
 * format it really was, so the message can say "that is a spreadsheet" instead
 * of "that did not work".
 */

const EXTENSIONS: Readonly<Record<string, PdfSourceFormat>> = {
    html: "html",
    htm: "html",
    xhtml: "html",
    md: "markdown",
    markdown: "markdown",
    mdown: "markdown",
    mkd: "markdown",
    mdx: "mdx",
    docx: "docx",
    pptx: "pptx",
    xlsx: "xlsx",
    xlsm: "xlsx",
};

/**
 * The pre-2007 binaries, which are not ZIPs and never will be.
 *
 * Named as their own refusal rather than falling through to "not a package":
 * "save it as .docx and try again" is advice a reader can act on, and a ZIP
 * reader's complaint about a missing end-of-central-directory record is not.
 */
const LEGACY_EXTENSIONS = new Set(["doc", "ppt", "xls", "rtf", "odt", "odp", "ods"]);

export function fileExtensionOf(filename: string): string {
    const dot = filename.lastIndexOf(".");

    return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isLegacyOfficeExtension(filename: string): boolean {
    return LEGACY_EXTENSIONS.has(fileExtensionOf(filename));
}

/** The format a filename claims, or `null` when the extension is not one of ours. */
export function formatFromFilename(filename: string): PdfSourceFormat | null {
    return EXTENSIONS[fileExtensionOf(filename)] ?? null;
}

export function isPackagedFormat(format: PdfSourceFormat): format is "docx" | "pptx" | "xlsx" {
    return format === "docx" || format === "pptx" || format === "xlsx";
}

/** `PK\x03\x04` — the local file header every ZIP, and so every OOXML file, starts with. */
export function looksLikeZip(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
    );
}

/**
 * `D0 CF 11 E0 A1 B1 1A E1` — the OLE2 compound-file header shared by every
 * pre-2007 Office document. Recognised so a `.doc` renamed to `.docx` is still
 * refused by name.
 */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function looksLikeLegacyOffice(bytes: Uint8Array): boolean {
    return (
        bytes.length >= OLE_SIGNATURE.length &&
        OLE_SIGNATURE.every((byte, index) => bytes[index] === byte)
    );
}

/**
 * Which Open XML part a package has to carry to be the format it claims.
 *
 * One entry each, and the check runs against the ZIP's own directory rather
 * than the extension, so a `.pptx` that is really a workbook is caught before
 * anything tries to read a slide out of it.
 */
export const PACKAGE_MARKERS: Readonly<Record<"docx" | "pptx" | "xlsx", string>> = {
    docx: "word/document.xml",
    pptx: "ppt/presentation.xml",
    xlsx: "xl/workbook.xml",
};

/** Which of the three a package's entry list says it actually is. */
export function packageFormatOf(entryNames: readonly string[]): "docx" | "pptx" | "xlsx" | null {
    const names = new Set(entryNames);

    for (const [format, marker] of Object.entries(PACKAGE_MARKERS)) {
        if (names.has(marker)) {
            return format as "docx" | "pptx" | "xlsx";
        }
    }

    return null;
}
