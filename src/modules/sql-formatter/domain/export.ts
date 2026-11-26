import type { DownloadFile } from "@/modules/tools/types";
import type { SqlExportRequest } from "../types";
import { SQL_MIME_TYPE } from "./constants";

/** `formatted-20261126T101500Z.sql` — sortable and self-describing. */
export function buildSqlExportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `formatted-${stamp}.sql`;
}

export function createSqlExportFile({ content, generatedAt }: SqlExportRequest): DownloadFile {
    return {
        filename: buildSqlExportFilename(generatedAt),
        mimeType: SQL_MIME_TYPE,
        content: content.length === 0 || content.endsWith("\n") ? content : `${content}\n`,
    };
}
