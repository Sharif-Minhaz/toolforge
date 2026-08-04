import { describe, expect, test } from "bun:test";

import { createBsonDownload, createTextExportFile } from "@/modules/bson/domain/export";

describe("createTextExportFile", () => {
    test("names a JSON export by its own type", () => {
        expect(createTextExportFile("json", "{}", "hex")).toEqual({
            filename: "document.json",
            mimeType: "application/json",
            content: "{}",
        });
    });

    test("uses the provisional media type TOON's spec asks for", () => {
        expect(createTextExportFile("toon", "a: 1", "hex")).toMatchObject({
            filename: "document.toon",
            mimeType: "text/toon",
        });
    });

    /**
     * A hex dump of a document is a transcript, not a document. Naming it
     * `.bson` produces a file every reader of BSON rejects, so the notation
     * goes in the name and the extension stays honest.
     */
    test("keeps BSON-as-text out of the .bson extension, and says which notation", () => {
        expect(createTextExportFile("bson", "3c00", "hex")).toEqual({
            filename: "document-hex.txt",
            mimeType: "text/plain",
            content: "3c00",
        });
        expect(createTextExportFile("bson", "PAA=", "base64")).toMatchObject({
            filename: "document-base64.txt",
        });
    });
});

describe("createBsonDownload", () => {
    test("hands over the real bytes under the real extension", async () => {
        const bytes = new Uint8Array([5, 0, 0, 0, 0]);
        const download = createBsonDownload(bytes);

        expect(download.filename).toBe("document.bson");
        expect(download.blob.type).toBe("application/bson");
        expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(bytes);
    });

    test("copies the bytes, so a later conversion cannot rewrite a queued file", async () => {
        const bytes = new Uint8Array([5, 0, 0, 0, 0]);
        const download = createBsonDownload(bytes);

        bytes.fill(0xff);

        expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(
            new Uint8Array([5, 0, 0, 0, 0]),
        );
    });
});
