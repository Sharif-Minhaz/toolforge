import { buildZipArchive } from "@/modules/tools/domain/archive";
import type { BlobDownload, DownloadFile } from "@/modules/tools/types";
import type { RsaArchiveRequest, RsaExportRequest, RsaKeyKind, RsaOutputFormat } from "../types";

const TEXT_MIME_TYPE = "text/plain;charset=utf-8";

const JSON_MIME_TYPE = "application/json;charset=utf-8";

const ZIP_MIME_TYPE = "application/zip";

/**
 * What each output format is called on disk.
 *
 * `.b64` rather than `.der` for the base64 form, and the distinction is not
 * pedantry: a `.der` file holds the raw bytes, and handing a reader base64 text
 * under that name would make `openssl rsa -inform DER` fail on a file that
 * looked right. What is on screen is text, so what is saved is text.
 */
const EXTENSIONS: Record<RsaOutputFormat, string> = {
    pem: "pem",
    der: "b64",
    jwk: "jwk.json",
};

function stampOf(generatedAt: Date): string {
    return generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

/** `rsa-private-20260808T101500Z.pem` — sortable, and it says which half it is. */
export function buildRsaKeyFilename(
    kind: RsaKeyKind,
    outputFormat: RsaOutputFormat,
    generatedAt: Date,
): string {
    return `rsa-${kind}-${stampOf(generatedAt)}.${EXTENSIONS[outputFormat]}`;
}

export function buildRsaArchiveFilename(generatedAt: Date): string {
    return `rsa-keypair-${stampOf(generatedAt)}.zip`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createRsaKeyFile(request: RsaExportRequest): DownloadFile {
    return {
        filename: buildRsaKeyFilename(request.kind, request.outputFormat, request.generatedAt),
        mimeType: request.outputFormat === "jwk" ? JSON_MIME_TYPE : TEXT_MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}

/**
 * Both halves in one archive, because they are only useful as a pair and
 * two downloads a second apart is how one of them ends up in the wrong folder.
 *
 * A ZIP rather than two `saveFile` calls in a row: browsers treat a second
 * programmatic download within a moment of the first as something to block, and
 * a reader who was silently given one key out of two would not find out until
 * the key did not work. It is also why the two names inside the archive keep the
 * same stamp — they are one generation, and their filenames say so.
 *
 * Stored rather than deflated, matching `buildZipArchive`'s own default. These
 * are a few kilobytes of base64; compressing them would save a rounding error.
 */
export function createRsaKeyPairArchive(request: RsaArchiveRequest): BlobDownload {
    const bytes = buildZipArchive(
        [
            {
                name: buildRsaKeyFilename("public", request.outputFormat, request.generatedAt),
                bytes: new TextEncoder().encode(withTrailingNewline(request.publicKey)),
            },
            {
                name: buildRsaKeyFilename("private", request.outputFormat, request.generatedAt),
                bytes: new TextEncoder().encode(withTrailingNewline(request.privateKey)),
            },
        ],
        request.generatedAt,
    );

    return {
        filename: buildRsaArchiveFilename(request.generatedAt),
        blob: new Blob([bytes], { type: ZIP_MIME_TYPE }),
    };
}
