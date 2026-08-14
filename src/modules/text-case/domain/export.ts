import { buildTimestampedFilename } from "@/modules/tools/domain/filenames";
import type { DownloadFile } from "@/modules/tools/types";
import type { TextCaseExportRequest } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** `toolforge-text-constant-20260814T101500Z.txt` — sortable and self-describing. */
export function buildTextCaseExportFilename(
    request: Pick<TextCaseExportRequest, "textCase" | "generatedAt">,
): string {
    return buildTimestampedFilename(`text-${request.textCase}`, request.generatedAt, "txt");
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createTextCaseExportFile(request: TextCaseExportRequest): DownloadFile {
    return {
        filename: buildTextCaseExportFilename(request),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
