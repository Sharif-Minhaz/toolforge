import type { BlobDownload, DownloadFile } from "@/modules/tools/types";
import type { AesBlobExportRequest, AesDirection, AesExportRequest } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** Deliberately vague: bytes that were a PNG are not announced as one. */
const BYTES_MIME_TYPE = "application/octet-stream";

function stampOf(generatedAt: Date): string {
    return generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

/** `aes-encrypted-20260808T101500Z.txt` — sortable and self-describing. */
export function buildAesExportFilename(direction: AesDirection, generatedAt: Date): string {
    return `aes-${direction === "encrypt" ? "encrypted" : "decrypted"}-${stampOf(generatedAt)}.txt`;
}

/**
 * The same name with a `.bin` suffix, for the result saved as bytes.
 *
 * The original filename is deliberately not recovered, because it was never
 * stored: a ciphertext carries the bytes and nothing else. Naming the download
 * after whatever file was opened would be a guess dressed as a fact.
 */
export function buildAesBlobFilename(direction: AesDirection, generatedAt: Date): string {
    return `aes-${direction === "encrypt" ? "encrypted" : "decrypted"}-${stampOf(generatedAt)}.bin`;
}

/**
 * The result as the bytes it actually is, which is what closes the loop for a
 * file. Decrypting a picture and offering only base64 would leave the last step
 * — turning that back into a file — to the reader.
 */
export function createAesBlobDownload(request: AesBlobExportRequest): BlobDownload {
    return {
        filename: buildAesBlobFilename(request.direction, request.generatedAt),
        blob: new Blob([request.bytes], { type: BYTES_MIME_TYPE }),
    };
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

/**
 * Only the payload. The salt, the IV and the iteration count are deliberately
 * left out: a file that carried them next to a ciphertext would read as a
 * complete record, and the one thing missing from it is the only thing that
 * matters.
 */
export function createAesExportFile(request: AesExportRequest): DownloadFile {
    return {
        filename: buildAesExportFilename(request.direction, request.generatedAt),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
