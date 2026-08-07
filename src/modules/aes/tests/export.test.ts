import { describe, expect, test } from "bun:test";

import {
    buildAesBlobFilename,
    buildAesExportFilename,
    createAesBlobDownload,
    createAesExportFile,
} from "../domain/export";

const AT = new Date("2026-08-08T10:15:00.000Z");

describe("buildAesExportFilename", () => {
    test("names the direction and stamps the instant", () => {
        expect(buildAesExportFilename("encrypt", AT)).toBe("aes-encrypted-20260808T101500Z.txt");
        expect(buildAesExportFilename("decrypt", AT)).toBe("aes-decrypted-20260808T101500Z.txt");
    });
});

describe("createAesExportFile", () => {
    test("writes plain text with a trailing newline", () => {
        expect(
            createAesExportFile({ direction: "encrypt", content: "abc", generatedAt: AT }),
        ).toEqual({
            filename: "aes-encrypted-20260808T101500Z.txt",
            mimeType: "text/plain;charset=utf-8",
            content: "abc\n",
        });
    });

    test("does not add a second newline", () => {
        const file = createAesExportFile({
            direction: "decrypt",
            content: "abc\n",
            generatedAt: AT,
        });

        expect(file.content).toBe("abc\n");
    });

    test("leaves an empty result empty", () => {
        const file = createAesExportFile({ direction: "encrypt", content: "", generatedAt: AT });

        expect(file.content).toBe("");
    });
});

describe("createAesBlobDownload", () => {
    test("names the direction and stamps the instant, with a .bin suffix", () => {
        expect(buildAesBlobFilename("decrypt", AT)).toBe("aes-decrypted-20260808T101500Z.bin");
        expect(buildAesBlobFilename("encrypt", AT)).toBe("aes-encrypted-20260808T101500Z.bin");
    });

    test("writes the bytes exactly, under a type that claims nothing", async () => {
        const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
        const download = createAesBlobDownload({ direction: "decrypt", bytes, generatedAt: AT });

        expect(download.filename).toBe("aes-decrypted-20260808T101500Z.bin");
        expect(download.blob.type).toBe("application/octet-stream");
        expect([...new Uint8Array(await download.blob.arrayBuffer())]).toEqual([...bytes]);
    });
});
