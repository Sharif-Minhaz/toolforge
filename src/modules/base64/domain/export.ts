import type { DownloadFile } from "@/modules/tools/types";
import type { Base64ExportRequest, Base64Mode } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** `base64-encoded-20260727T101500Z.txt` — sortable and self-describing. */
export function buildBase64ExportFilename(mode: Base64Mode, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `base64-${mode === "encode" ? "encoded" : "decoded"}-${stamp}.txt`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createBase64ExportFile(request: Base64ExportRequest): DownloadFile {
    return {
        filename: buildBase64ExportFilename(request.mode, request.generatedAt),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
