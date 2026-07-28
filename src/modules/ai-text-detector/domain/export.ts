import type { DownloadFile } from "@/modules/tools/types";
import type { DetectionExportRequest } from "../types";

/** `ai-text-report-20260728T101500Z.json` — sortable and self-describing. */
export function buildDetectionFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `ai-text-report-${stamp}.json`;
}

/**
 * JSON rather than prose: the report is something a reviewer files alongside
 * the submission, and a machine-readable record survives being pasted around.
 */
export function createDetectionExportFile(request: DetectionExportRequest): DownloadFile {
    const { text, verdict, metrics, generatedAt } = request;

    const report = {
        generatedAt: generatedAt.toISOString(),
        label: verdict.label,
        confidence: verdict.confidence,
        band: verdict.band,
        reasoning: verdict.reasoning,
        model: verdict.model,
        metrics,
        text,
    };

    return {
        filename: buildDetectionFilename(generatedAt),
        mimeType: "application/json;charset=utf-8",
        content: `${JSON.stringify(report, null, 2)}\n`,
    };
}
