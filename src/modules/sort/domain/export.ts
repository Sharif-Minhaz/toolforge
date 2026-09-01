import { buildTimestampedFilename } from "@/modules/tools/domain/filenames";
import type { DownloadFile } from "@/modules/tools/types";
import type { SortExportRequest } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** `toolforge-sorted-ascending-20260901T101500Z.txt` — sortable and self-describing. */
export function buildSortExportFilename(
    request: Pick<SortExportRequest, "order" | "generatedAt">,
): string {
    return buildTimestampedFilename(`sorted-${request.order}`, request.generatedAt, "txt");
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createSortExportFile(request: SortExportRequest): DownloadFile {
    return {
        filename: buildSortExportFilename(request),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
