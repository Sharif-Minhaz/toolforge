import type { DownloadFile } from "@/modules/tools/types";
import type { UrlExportRequest, UrlMode } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** `url-encoded-20260728T101500Z.txt` — sortable and self-describing. */
export function buildUrlExportFilename(mode: UrlMode, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `url-${mode === "encode" ? "encoded" : "decoded"}-${stamp}.txt`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createUrlExportFile(request: UrlExportRequest): DownloadFile {
    return {
        filename: buildUrlExportFilename(request.mode, request.generatedAt),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
