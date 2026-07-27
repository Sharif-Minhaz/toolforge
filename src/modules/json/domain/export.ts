import type { DownloadFile } from "@/modules/tools/types";
import type { JsonExportRequest, JsonMode } from "../types";
import { JSON_MIME_TYPE } from "./constants";

const FILENAME_PART: Record<JsonMode, string> = {
    beautify: "formatted",
    minify: "minified",
    validate: "validated",
};

/** `json-formatted-20260727T101500Z.json` — sortable and self-describing. */
export function buildJsonExportFilename(mode: JsonMode, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `json-${FILENAME_PART[mode]}-${stamp}.json`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createJsonExportFile(request: JsonExportRequest): DownloadFile {
    return {
        filename: buildJsonExportFilename(request.mode, request.generatedAt),
        mimeType: JSON_MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
