import type { BlobDownload, DownloadFile } from "@/modules/tools/types";
import type { RsaCryptBlobExportRequest, RsaCryptDirection, RsaCryptExportRequest } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** Deliberately vague: bytes that were a PNG are not announced as one. */
const BYTES_MIME_TYPE = "application/octet-stream";

function stampOf(generatedAt: Date): string {
    return generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

function suffixOf(direction: RsaCryptDirection): string {
    return direction === "encrypt" ? "encrypted" : "decrypted";
}

/** `rsa-encrypted-20260809T101500Z.txt` — sortable and self-describing. */
export function buildRsaCryptFilename(direction: RsaCryptDirection, generatedAt: Date): string {
    return `rsa-${suffixOf(direction)}-${stampOf(generatedAt)}.txt`;
}

/**
 * The same name with a `.bin` suffix, for the result saved as bytes.
 *
 * The original filename is deliberately not recovered, because it was never
 * stored: a ciphertext carries the bytes and nothing else. Naming the download
 * after whatever file was opened would be a guess dressed as a fact.
 */
export function buildRsaCryptBlobFilename(direction: RsaCryptDirection, generatedAt: Date): string {
    return `rsa-${suffixOf(direction)}-${stampOf(generatedAt)}.bin`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

/**
 * Only the payload. The key is deliberately left out: a file that carried a
 * private key next to a ciphertext would read as a complete record, and the one
 * thing missing from it is the only thing that matters.
 */
export function createRsaCryptExportFile(request: RsaCryptExportRequest): DownloadFile {
    return {
        filename: buildRsaCryptFilename(request.direction, request.generatedAt),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}

/**
 * The result as the bytes it actually is, which is what closes the loop for a
 * decrypted payload that was never text.
 */
export function createRsaCryptBlobDownload(request: RsaCryptBlobExportRequest): BlobDownload {
    return {
        filename: buildRsaCryptBlobFilename(request.direction, request.generatedAt),
        blob: new Blob([request.bytes], { type: BYTES_MIME_TYPE }),
    };
}
