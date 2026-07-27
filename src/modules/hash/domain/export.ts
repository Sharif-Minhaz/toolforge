import type { DownloadFile } from "@/modules/tools/types";
import type { HashExportRequest, HashMode } from "../types";

const TEXT_MIME_TYPE = "text/plain;charset=utf-8";

/** `hash-generated-20260727T101500Z.txt` — sortable and self-describing. */
export function buildHashExportFilename(mode: HashMode, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return mode === "generate" ? `hash-generated-${stamp}.txt` : `hash-compared-${stamp}.txt`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createHashExportFile(request: HashExportRequest): DownloadFile {
    return {
        filename: buildHashExportFilename(request.mode, request.generatedAt),
        mimeType: TEXT_MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
