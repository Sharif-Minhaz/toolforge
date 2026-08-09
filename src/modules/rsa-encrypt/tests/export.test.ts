import { describe, expect, test } from "bun:test";

import {
    buildRsaCryptBlobFilename,
    buildRsaCryptFilename,
    createRsaCryptBlobDownload,
    createRsaCryptExportFile,
} from "../domain/export";

const AT = new Date("2026-08-09T10:15:00.000Z");

describe("filenames", () => {
    test("say which direction produced them, and when", () => {
        expect(buildRsaCryptFilename("encrypt", AT)).toBe("rsa-encrypted-20260809T101500Z.txt");
        expect(buildRsaCryptFilename("decrypt", AT)).toBe("rsa-decrypted-20260809T101500Z.txt");
    });

    test("give the bytes form its own suffix", () => {
        expect(buildRsaCryptBlobFilename("decrypt", AT)).toBe("rsa-decrypted-20260809T101500Z.bin");
    });
});

describe("createRsaCryptExportFile", () => {
    test("saves the payload as text and terminates it", () => {
        const file = createRsaCryptExportFile({
            direction: "encrypt",
            content: "Zm9v",
            generatedAt: AT,
        });

        expect(file.content).toBe("Zm9v\n");
        expect(file.mimeType).toBe("text/plain;charset=utf-8");
    });

    test("does not add a second newline to a body that already ends in one", () => {
        expect(
            createRsaCryptExportFile({ direction: "decrypt", content: "hi\n", generatedAt: AT })
                .content,
        ).toBe("hi\n");
    });

    /**
     * The key is deliberately not in the file. A download carrying a private
     * key next to a ciphertext would read as a complete record, and the one
     * thing missing from it is the only thing that matters.
     */
    test("carries the payload and nothing else", () => {
        const file = createRsaCryptExportFile({
            direction: "encrypt",
            content: "Zm9v",
            generatedAt: AT,
        });

        expect(file.content).not.toContain("BEGIN");
        expect(file.content.trim()).toBe("Zm9v");
    });
});

describe("createRsaCryptBlobDownload", () => {
    test("keeps the bytes exactly, under a deliberately vague type", async () => {
        const bytes = new Uint8Array([0xff, 0x00, 0x41]);
        const download = createRsaCryptBlobDownload({
            direction: "decrypt",
            bytes,
            generatedAt: AT,
        });

        expect(download.filename).toBe("rsa-decrypted-20260809T101500Z.bin");
        expect(download.blob.type).toBe("application/octet-stream");
        expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(bytes);
    });
});
