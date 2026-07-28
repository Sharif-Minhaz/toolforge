import type { DownloadFile } from "@/modules/tools/types";
import type { RegexExportRequest } from "../types";

const MIME_TYPE = "application/json;charset=utf-8";

/** `regex-match-20260728T101500Z.json` — sortable and self-describing. */
export function buildRegexExportFilename(mode: string, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `regex-${mode}-${stamp}.json`;
}

/**
 * A JSON report rather than a flat list: capture groups are the reason anyone
 * exports a match set, and they do not survive being flattened into lines.
 */
export function createRegexExportFile(request: RegexExportRequest): DownloadFile {
    const { analysis } = request;

    const report = {
        pattern: request.pattern,
        flags: request.flagLetters,
        mode: request.mode,
        generatedAt: request.generatedAt.toISOString(),
        matchCount: analysis.matches.length,
        truncated: analysis.truncated,
        matches: analysis.matches.map((match) => ({
            start: match.start,
            end: match.end,
            value: match.value,
            captures: match.captures.map((capture) => ({
                index: capture.index,
                name: capture.name,
                value: capture.value,
                start: capture.start,
                end: capture.end,
            })),
        })),
        ...(request.mode === "match" ? {} : { output: analysis.output }),
    };

    return {
        filename: buildRegexExportFilename(request.mode, request.generatedAt),
        mimeType: MIME_TYPE,
        content: `${JSON.stringify(report, null, 2)}\n`,
    };
}
