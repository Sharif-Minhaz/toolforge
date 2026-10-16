import { describe, expect, test } from "bun:test";

import { buildDocx, buildXlsx } from "@/modules/tools/tests/office-fixtures";

import { openCompoundFile } from "@/modules/text-to-speech/domain/compound-file";
import { MAX_SOURCE_FILE_BYTES } from "@/modules/text-to-speech/domain/constants";
import {
    decodePlainText,
    extractDocumentText,
    tidyExtractedText,
} from "@/modules/text-to-speech/domain/extract";
import { readWordText } from "@/modules/text-to-speech/domain/word-binary";

import { buildCompoundFile, buildOpenDocument, buildPdf, buildWordDocument } from "./fixtures";

const encode = (text: string) => new TextEncoder().encode(text);

describe("the compound-file reader", () => {
    test("reads a large stream from sectors and a small one from the mini stream", () => {
        const large = Uint8Array.from({ length: 5_000 }, (_, index) => index % 251);
        const small = encode("tiny stream");
        const file = openCompoundFile(
            buildCompoundFile([
                { name: "Large", data: large },
                { name: "Small", data: small },
            ]),
        );

        expect(file?.streamNames.toSorted()).toEqual(["Large", "Small"]);
        expect(file?.readStream("Large")).toEqual(large);
        expect(file?.readStream("Small")).toEqual(small);
        expect(file?.readStream("Missing")).toBeNull();
    });

    test("refuses a file without the signature", () => {
        expect(openCompoundFile(new Uint8Array(1_024))).toBeNull();
    });

    test("refuses a sector chain that loops back on itself", () => {
        const bytes = buildCompoundFile([{ name: "Large", data: new Uint8Array(5_000) }]);
        const view = new DataView(bytes.buffer);
        // The large stream starts at sector 3 (after FAT, directory and mini
        // FAT); point its FAT entry at itself.
        view.setUint32(512 + 3 * 4, 3, true);

        expect(openCompoundFile(bytes)?.readStream("Large")).toBeNull();
    });

    test("refuses a header with an impossible sector size", () => {
        const bytes = buildCompoundFile([{ name: "S", data: encode("x") }]);

        new DataView(bytes.buffer).setUint16(0x1e, 10, true);
        expect(openCompoundFile(bytes)).toBeNull();
    });
});

describe("Word 97–2003", () => {
    const read = (bytes: Uint8Array) => {
        const file = openCompoundFile(bytes);

        return file === null ? null : readWordText(file);
    };

    test("joins 8-bit and UTF-16 pieces in character order, not file order", () => {
        const bytes = buildWordDocument({
            pieces: [
                { text: "Café — ", compressed: true },
                { text: "ভালো আছেন?\r", compressed: false },
            ],
            fileOrder: [1, 0],
        });

        expect(read(bytes)).toEqual({ ok: true, text: "Café — ভালো আছেন?\n" });
    });

    test("skips a property run ahead of the piece table", () => {
        const bytes = buildWordDocument({
            pieces: [{ text: "Plain.\r", compressed: true }],
            withPropertyRun: true,
        });

        expect(read(bytes)).toEqual({ ok: true, text: "Plain.\n" });
    });

    test("stops at the end of the main body", () => {
        const bytes = buildWordDocument({
            pieces: [{ text: "Body.\rFootnote text\r", compressed: true }],
            mainLength: 6,
        });

        expect(read(bytes)).toEqual({ ok: true, text: "Body.\n" });
    });

    test("keeps a field's result and drops its code, nested too", () => {
        const text =
            'See \u0013 HYPERLINK "https://x" \u0014the \u0013PAGE\u00143\u0015 site\u0015.\u0007\u0007';
        const bytes = buildWordDocument({ pieces: [{ text, compressed: false }] });

        expect(read(bytes)).toEqual({ ok: true, text: "See the 3 site.\n\n" });
    });

    test("names an encrypted document, and an older Word, apart from a broken one", () => {
        const pieces = [{ text: "x", compressed: true }];

        expect(read(buildWordDocument({ pieces, encrypted: true }))).toEqual({
            ok: false,
            reason: "encrypted",
        });
        expect(read(buildWordDocument({ pieces, nFib: 0x0065 }))).toEqual({
            ok: false,
            reason: "unsupported_format",
        });
        expect(readWordText({ streamNames: [], readStream: () => null })).toEqual({
            ok: false,
            reason: "unreadable",
        });
    });
});

describe("extracting a picked document", () => {
    test("reads a .doc by its bytes, whatever it is called", async () => {
        const bytes = buildWordDocument({ pieces: [{ text: "Hello.\r", compressed: true }] });

        expect(await extractDocumentText("renamed.docx", bytes)).toEqual({
            ok: true,
            text: "Hello.",
            format: "doc",
            truncated: false,
        });
    });

    test("reads a .docx, keeping a manual line break as a line", async () => {
        const result = await extractDocumentText(
            "a.docx",
            buildDocx([{ text: "Title", style: "Heading 1" }, { text: "Body text." }]),
        );

        expect(result).toEqual({
            ok: true,
            text: "Title\nBody text.",
            format: "docx",
            truncated: false,
        });
    });

    test("reads an .odt, honouring spaces, tabs and breaks, and skipping notes", async () => {
        const body =
            '<text:h>Heading</text:h><text:p>a<text:s text:c="3"/>b<text:tab/>c<text:line-break/>d' +
            "<text:note><text:note-body><text:p>note</text:p></text:note-body></text:note></text:p>" +
            "<table:table><table:table-row><table:table-cell><text:p>Cell</text:p></table:table-cell></table:table-row></table:table>";

        expect(await extractDocumentText("a.odt", buildOpenDocument(body))).toEqual({
            ok: true,
            text: "Heading\na   b\tc\nd\nCell",
            format: "odt",
            truncated: false,
        });
    });

    test("reads a workbook a row to a line, cells joined", async () => {
        const result = await extractDocumentText(
            "book.xlsx",
            buildXlsx([
                {
                    name: "First",
                    rows: [
                        ["Name", "Score"],
                        ["Rahim", 42],
                    ],
                },
                { name: "Second", rows: [["Only"]] },
            ]),
        );

        expect(result).toEqual({
            ok: true,
            text: "First\nName, Score\nRahim, 42\n\nSecond\nOnly",
            format: "xlsx",
            truncated: false,
        });
    });

    test("reads a PDF's text", async () => {
        const result = await extractDocumentText("a.pdf", buildPdf("Hello from a PDF"));

        expect(result).toMatchObject({ ok: true, format: "pdf", text: "Hello from a PDF" });
    });

    test("reads plain text by extension, and only by extension", async () => {
        expect(
            await extractDocumentText("notes.txt", encode("Line one\r\nLine two")),
        ).toMatchObject({
            ok: true,
            text: "Line one\nLine two",
            format: "txt",
        });
        expect(await extractDocumentText("page.html", encode("<p>hi</p>"))).toEqual({
            ok: false,
            reason: "unsupported_format",
        });
    });

    test("names a locked Office file as locked", async () => {
        const bytes = buildCompoundFile([
            { name: "EncryptionInfo", data: encode("x") },
            { name: "EncryptedPackage", data: encode("y") },
        ]);

        expect(await extractDocumentText("secret.docx", bytes)).toEqual({
            ok: false,
            reason: "encrypted",
        });
    });

    test("an OpenDocument that is not text or a spreadsheet is unsupported", async () => {
        const slides = buildOpenDocument("", "application/vnd.oasis.opendocument.presentation");

        expect(await extractDocumentText("deck.odp", slides)).toEqual({
            ok: false,
            reason: "unsupported_format",
        });
    });

    test("a document with nothing in it is empty, not blank output", async () => {
        expect(await extractDocumentText("blank.txt", encode("  \n\n "))).toEqual({
            ok: false,
            reason: "empty",
        });
    });

    test("refuses a file over the ceiling before reading it", async () => {
        const huge = new Uint8Array(MAX_SOURCE_FILE_BYTES + 1);

        expect(await extractDocumentText("big.txt", huge)).toEqual({
            ok: false,
            reason: "too_large",
        });
    });
});

describe("tidying", () => {
    test("normalises line ends, trailing space, controls and blank runs", () => {
        expect(tidyExtractedText("a  \r\nb\u0002\r\n\n\n\nc  ")).toBe("a\nb\n\nc");
    });

    test("honours a UTF-16 byte-order mark", () => {
        const le = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
        const be = new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);

        expect(decodePlainText(le)).toBe("hi");
        expect(decodePlainText(be)).toBe("hi");
        expect(decodePlainText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68]))).toBe("h");
    });
});
