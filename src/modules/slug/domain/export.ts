import type { DownloadFile } from "@/modules/tools/types";
import type { SlugExportRequest } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** `slugs-20260802T101500Z.txt` — sortable and self-describing. */
export function buildSlugExportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `slugs-${stamp}.txt`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createSlugExportFile(request: SlugExportRequest): DownloadFile {
    return {
        filename: buildSlugExportFilename(request.generatedAt),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
