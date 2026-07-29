import type { DownloadFile } from "@/modules/tools/types";
import type { CronExportRequest } from "../types";
import { formatIsoInZone, formatWallClock } from "./format";

const MIME_TYPE = "application/json";

/** `cron-runs-20260729T120000Z.json` — sortable and self-describing. */
export function buildCronExportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `cron-runs-${stamp}.json`;
}

/**
 * JSON rather than plain text: the payload is a schedule and the instants it
 * produces, which is a record. Every run carries its epoch, its offset-bearing
 * ISO form and its bare wall clock, so the file answers whichever of the three
 * questions the reader came with — and stays free of the reader's locale.
 */
export function createCronExportFile(request: CronExportRequest): DownloadFile {
    const payload = {
        expression: request.source,
        timeZone: request.timeZone,
        runs: request.runs.map((epochMs) => ({
            epochMs,
            epochSeconds: Math.floor(epochMs / 1000),
            iso8601: formatIsoInZone(epochMs, request.timeZone),
            wallClock: formatWallClock(epochMs, request.timeZone),
        })),
        generatedAt: request.generatedAt.toISOString(),
    };

    return {
        filename: buildCronExportFilename(request.generatedAt),
        mimeType: MIME_TYPE,
        content: `${JSON.stringify(payload, null, 2)}\n`,
    };
}
