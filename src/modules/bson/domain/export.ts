import type { BlobDownload, DownloadFile } from "@/modules/tools/types";
import type { BsonEncoding, DataFormat } from "../types";

/**
 * `text/toon` is provisional — the format has no IANA registration yet, and
 * SPEC.md §17 asks implementers to use it anyway. Both text types are UTF-8;
 * TOON documents are defined to be.
 */
const MIME_TYPES = {
    bson: "application/bson",
    json: "application/json",
    toon: "text/toon",
} as const satisfies Record<DataFormat, string>;

const EXTENSIONS = {
    bson: "txt",
    json: "json",
    toon: "toon",
} as const satisfies Record<DataFormat, string>;

/**
 * BSON written as text is not a `.bson` file — it is a transcript of one, so it
 * downloads as `.txt` and the raw bytes get the real extension. Naming a hex
 * dump `.bson` produces a file every tool that reads BSON rejects.
 */
export function createTextExportFile(
    target: DataFormat,
    content: string,
    encoding: BsonEncoding,
): DownloadFile {
    const suffix = target === "bson" ? `-${encoding}` : "";

    return {
        filename: `document${suffix}.${EXTENSIONS[target]}`,
        mimeType: target === "bson" ? "text/plain" : MIME_TYPES[target],
        content,
    };
}

export function createBsonDownload(bytes: Uint8Array): BlobDownload {
    return {
        filename: "document.bson",
        // A fresh buffer, because the caller's view may be a window onto a
        // larger allocation the next conversion is free to reuse.
        blob: new Blob([bytes.slice()], { type: MIME_TYPES.bson }),
    };
}
