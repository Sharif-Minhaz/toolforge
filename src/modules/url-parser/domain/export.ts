import type { DownloadFile } from "@/modules/tools/types";
import { URL_PART_IDS, type UrlParseSuccess, type UrlParserExportRequest } from "../types";

const MIME_TYPE = "application/json;charset=utf-8";

/** `url-parts-20260802T101500Z.json` — sortable and self-describing. */
export function buildUrlParserExportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `url-parts-${stamp}.json`;
}

/**
 * The parse as JSON, keys in the order the tool lists them rather than the
 * order the platform happens to enumerate. Shared by the copy button and the
 * download, so what lands on the clipboard is byte-for-byte what lands on disk.
 */
export function buildUrlParserJson(parsed: UrlParseSuccess): string {
    const parts = Object.fromEntries(URL_PART_IDS.map((id) => [id, parsed.parts[id]]));

    return JSON.stringify(
        {
            href: parsed.href,
            parts,
            params: parsed.params.map((param) => ({ key: param.key, value: param.value })),
        },
        null,
        2,
    );
}

export function createUrlParserExportFile(request: UrlParserExportRequest): DownloadFile {
    return {
        filename: buildUrlParserExportFilename(request.generatedAt),
        mimeType: MIME_TYPE,
        content: `${buildUrlParserJson(request.parsed)}\n`,
    };
}
