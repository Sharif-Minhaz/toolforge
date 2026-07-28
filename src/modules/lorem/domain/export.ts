import type { DownloadFile, LoremExportRequest, LoremFormat, LoremSource } from "../types";

const MIME_TYPES: Record<LoremFormat, string> = {
    plain: "text/plain;charset=utf-8",
    html: "text/html;charset=utf-8",
};

const EXTENSIONS: Record<LoremFormat, string> = {
    plain: "txt",
    html: "html",
};

export function getLoremMimeType(format: LoremFormat): string {
    return MIME_TYPES[format];
}

/** `random-text-kafka-20260728T101500Z.txt` — sortable and self-describing. */
export function buildLoremFilename(
    source: LoremSource,
    format: LoremFormat,
    generatedAt: Date,
): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `random-text-${source}-${stamp}.${EXTENSIONS[format]}`;
}

export function createLoremExportFile(request: LoremExportRequest): DownloadFile {
    const { text, format, source, generatedAt } = request;

    return {
        filename: buildLoremFilename(source, format, generatedAt),
        mimeType: getLoremMimeType(format),
        // A file that does not end in a newline annoys every unix tool that
        // reads it; an empty result stays genuinely empty.
        content: text.length > 0 ? `${text}\n` : "",
    };
}
