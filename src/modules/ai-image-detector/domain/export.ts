import type { DownloadFile } from "@/modules/tools/types";
import type { ImageDetectionExportRequest } from "../types";

/** `ai-image-report-20260729T101500Z.json` — sortable and self-describing. */
export function buildImageReportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `ai-image-report-${stamp}.json`;
}

/**
 * JSON rather than prose: the report is something a reviewer files alongside
 * the picture, and a machine-readable record survives being pasted around.
 *
 * The image itself is not embedded. A base64 copy of a 10 MB photograph would
 * make the report unopenable in a text editor, and the reviewer already has the
 * file — the name, type and size are enough to tie the two together.
 */
export function createImageReportFile(request: ImageDetectionExportRequest): DownloadFile {
    const { facts, verdict, generatedAt } = request;

    const report = {
        generatedAt: generatedAt.toISOString(),
        label: verdict.label,
        confidence: verdict.band,
        reasoning: verdict.reasoning,
        image: {
            name: facts.name,
            type: facts.type,
            bytes: facts.bytes,
            width: facts.width,
            height: facts.height,
        },
    };

    return {
        filename: buildImageReportFilename(generatedAt),
        mimeType: "application/json;charset=utf-8",
        content: `${JSON.stringify(report, null, 2)}\n`,
    };
}
