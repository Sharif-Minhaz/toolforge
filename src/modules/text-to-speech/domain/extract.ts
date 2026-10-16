import { unzipSync } from "fflate";

import {
    fileExtensionOf,
    looksLikeLegacyOffice,
    looksLikePdf,
    looksLikeZip,
} from "@/modules/tools/domain/file-signature";
import { clampToLimit } from "@/modules/tools/domain/input-limit";
import { parseXml, type XmlPackage } from "@/modules/tools/domain/xml-package";

import type { ExtractionFailureReason, ExtractionResult, SourceFormat } from "../types";
import { removeUnspeakableCharacters } from "./chunks";
import { openCompoundFile } from "./compound-file";
import { MAX_EXTRACTED_CHARACTERS, MAX_SOURCE_FILE_BYTES } from "./constants";
import { readOpenDocumentText } from "./open-document";
import { readWordText } from "./word-binary";

/**
 * A picked document in, the words in it out — in the reader's tab, never on
 * the server. The text is all the route ever sees, and only once the reader
 * presses Generate.
 *
 * The bytes decide the format, not the name. A `.doc` renamed `.docx` is still
 * a compound file and is read as one; a `.txt` that is really a PDF is read as
 * a PDF. The name is consulted only when the bytes carry no signature at all,
 * which is plain text and nothing else.
 *
 * The three heavy readers — PDF.js, SheetJS, Mammoth — are imported on demand,
 * so a reader who only ever types pays for none of them.
 */

const TEXT_EXTENSIONS = new Set(["txt", "text"]);

const ODF_TEXT = "application/vnd.oasis.opendocument.text";
const ODF_SPREADSHEET = "application/vnd.oasis.opendocument.spreadsheet";

type Refusal = { readonly ok: false; readonly reason: ExtractionFailureReason };

type Read = { readonly ok: true; readonly text: string } | Refusal;

type Reader = { readonly format: SourceFormat; readonly read: () => Promise<Read> };

const refuse = (reason: ExtractionFailureReason): Refusal => ({ ok: false, reason });

/**
 * Lines ending clean, Windows line ends gone, control characters gone, blank
 * runs no longer than one empty line. Every reader hands its text through
 * this, so a table row from a `.doc` and one from an `.odt` arrive in the box
 * looking alike — and PDF.js's stray `\u0002` glyph markers never reach it.
 */
export function tidyExtractedText(text: string): string {
    return removeUnspeakableCharacters(text.replace(/\r\n?/gu, "\n"))
        .split("\n")
        .map((line) => line.replace(/[\t \u00a0]+$/u, ""))
        .join("\n")
        .replace(/\n{3,}/gu, "\n\n")
        .trim();
}

/** UTF-8 unless a byte-order mark says otherwise. Never throws: a stray byte reads as U+FFFD. */
export function decodePlainText(bytes: Uint8Array): string {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }

    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    }

    // `TextDecoder` drops a UTF-8 byte-order mark by itself.
    return new TextDecoder("utf-8").decode(bytes);
}

/**
 * The ZIP's directory, with only the two members that identify an
 * OpenDocument file inflated. A fifty-megabyte workbook is not unpacked twice
 * just to learn that it is a workbook.
 */
function peekPackage(bytes: Uint8Array): XmlPackage | null {
    const names: string[] = [];

    try {
        const unzipped = unzipSync(bytes, {
            filter: (file) => {
                names.push(file.name);

                return file.name === "mimetype" || file.name === "content.xml";
            },
        });

        return { entries: new Map(Object.entries(unzipped)), names };
    } catch {
        return null;
    }
}

function packageFormat(pkg: XmlPackage): SourceFormat | null {
    const names = new Set(pkg.names);

    if (names.has("word/document.xml")) {
        return "docx";
    }

    if (names.has("xl/workbook.xml")) {
        return "xlsx";
    }

    const mimetype = pkg.entries.get("mimetype");
    const declared = mimetype === undefined ? "" : new TextDecoder().decode(mimetype).trim();

    if (declared === ODF_TEXT) {
        return "odt";
    }

    return declared === ODF_SPREADSHEET ? "ods" : null;
}

async function readPdf(bytes: Uint8Array): Promise<Read> {
    const { extractText, getDocumentProxy } = await import("unpdf");

    try {
        // A copy, because PDF.js transfers the buffer it is handed to its
        // worker and the caller's array would be left detached.
        const document = await getDocumentProxy(bytes.slice());
        const { text } = await extractText(document, { mergePages: false });

        return { ok: true, text: text.join("\n\n") };
    } catch (caught) {
        const name = caught instanceof Error ? caught.name : "";

        return refuse(name === "PasswordException" ? "encrypted" : "unreadable");
    }
}

/** Elements that start a new line of their own in Mammoth's HTML. */
const DOCX_BLOCKS = new Set([
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ul",
    "ol",
    "table",
    "tr",
    "td",
    "th",
    "blockquote",
]);

function collectHtmlText(node: Node, out: string[]): void {
    for (let index = 0; index < node.childNodes.length; index += 1) {
        const child = node.childNodes[index];

        if (child.nodeType === 3) {
            out.push(child.nodeValue ?? "");
            continue;
        }

        if (child.nodeType !== 1) {
            continue;
        }

        const name = child.nodeName.toLowerCase();

        if (name === "br") {
            out.push("\n");
        } else if (name !== "img") {
            const block = DOCX_BLOCKS.has(name);

            out.push(block ? "\n" : "");
            collectHtmlText(child, out);
            out.push(block ? "\n" : "");
        }
    }
}

/**
 * Word through Mammoth's HTML rather than its raw-text mode, which drops a
 * manual line break and runs the two lines together — "Line oneLine two" — a
 * join a voice reads as one word.
 */
async function readDocx(bytes: Uint8Array): Promise<Read> {
    const mammoth = (await import("mammoth")).default;
    // Both keys, for the reason `pdf-converter/domain/read-docx.ts` gives:
    // Mammoth's browser and server builds each accept only one of them.
    const buffer = bytes.slice().buffer;
    const input: Parameters<typeof mammoth.convertToHtml>[0] = { arrayBuffer: buffer };

    Object.assign(input, { buffer });

    let html: string;

    try {
        html = (
            await mammoth.convertToHtml(input, {
                // Pictures cannot be read aloud, and inlining each one as a
                // base64 `data:` URI only to throw it away is the expensive
                // part of converting a document full of them.
                convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
            })
        ).value;
    } catch {
        return refuse("unreadable");
    }

    // Mammoth writes well-formed markup — escaped text, self-closed void
    // elements — so one root element makes it a document the XML parser takes.
    const root = parseXml(`<root>${html}</root>`);

    if (root === null) {
        return refuse("unreadable");
    }

    const out: string[] = [];

    collectHtmlText(root, out);

    return { ok: true, text: out.join("").replace(/\n\s*\n/gu, "\n") };
}

/**
 * Every sheet, a line per row, cells joined with a comma — which is how a
 * person reads a row aloud. Values come out *formatted*, as the cell shows
 * them: a reader hears "15/01/2026", not the serial number 46037.
 */
async function readSpreadsheet(bytes: Uint8Array): Promise<Read> {
    const XLSX = await import("xlsx");

    try {
        const workbook = XLSX.read(bytes, { type: "array", dense: true, cellFormula: false });
        const lines: string[] = [];
        const named = workbook.SheetNames.length > 1;

        for (const name of workbook.SheetNames) {
            const sheet = workbook.Sheets[name];

            if (sheet === undefined) {
                continue;
            }

            const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
                header: 1,
                raw: false,
                blankrows: false,
                defval: "",
            });

            if (named) {
                lines.push(name);
            }

            for (const row of rows) {
                const cells = row
                    .map((cell) => String(cell).trim())
                    .filter((cell) => cell.length > 0);

                if (cells.length > 0) {
                    lines.push(cells.join(", "));
                }
            }

            lines.push("");
        }

        return { ok: true, text: lines.join("\n") };
    } catch (caught) {
        // SheetJS has no typed errors; its message is matched, never shown.
        const message = caught instanceof Error ? caught.message : "";

        return refuse(/password|encrypt/iu.test(message) ? "encrypted" : "unreadable");
    }
}

function readCompound(bytes: Uint8Array): Reader | Refusal {
    const file = openCompoundFile(bytes);

    if (file === null) {
        return refuse("unreadable");
    }

    const streams = new Set(file.streamNames);

    // A password-protected `.docx` or `.xlsx` is not a ZIP at all: Office
    // wraps the encrypted package in a compound file. Recognised so it is
    // refused as locked rather than as unreadable.
    if (streams.has("EncryptedPackage")) {
        return refuse("encrypted");
    }

    if (streams.has("WordDocument")) {
        return {
            format: "doc",
            read: async () => {
                const result = readWordText(file);

                return result.ok ? result : refuse(result.reason);
            },
        };
    }

    if (streams.has("Workbook") || streams.has("Book")) {
        return { format: "xls", read: () => readSpreadsheet(bytes) };
    }

    return refuse("unsupported_format");
}

function chooseReader(filename: string, bytes: Uint8Array): Reader | Refusal {
    if (looksLikePdf(bytes)) {
        return { format: "pdf", read: () => readPdf(bytes) };
    }

    if (looksLikeLegacyOffice(bytes)) {
        return readCompound(bytes);
    }

    if (looksLikeZip(bytes)) {
        const pkg = peekPackage(bytes);
        const format = pkg === null ? null : packageFormat(pkg);

        switch (format) {
            case "docx":
                return { format, read: () => readDocx(bytes) };
            case "odt": {
                const text = pkg === null ? null : readOpenDocumentText(pkg);

                return {
                    format,
                    read: async () => (text === null ? refuse("unreadable") : { ok: true, text }),
                };
            }
            case "xlsx":
            case "ods":
                return { format, read: () => readSpreadsheet(bytes) };
            default:
                return refuse(pkg === null ? "unreadable" : "unsupported_format");
        }
    }

    if (TEXT_EXTENSIONS.has(fileExtensionOf(filename))) {
        return { format: "txt", read: async () => ({ ok: true, text: decodePlainText(bytes) }) };
    }

    return refuse("unsupported_format");
}

export async function extractDocumentText(
    filename: string,
    bytes: Uint8Array,
): Promise<ExtractionResult> {
    if (bytes.length > MAX_SOURCE_FILE_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    const reader = chooseReader(filename, bytes);

    if ("reason" in reader) {
        return reader;
    }

    const read = await reader.read();

    if (!read.ok) {
        return read;
    }

    const tidy = tidyExtractedText(read.text);

    if (tidy.length === 0) {
        return { ok: false, reason: "empty" };
    }

    const text = clampToLimit(tidy, MAX_EXTRACTED_CHARACTERS);

    return { ok: true, text, format: reader.format, truncated: text.length < tidy.length };
}
