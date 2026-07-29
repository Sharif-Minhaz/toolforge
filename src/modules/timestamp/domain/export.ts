import { isFormattableTimeZone } from "@/modules/tools/domain/zone";
import type { DownloadFile } from "@/modules/tools/types";
import type { TimestampExportRequest } from "../types";
import { renderEpochs, renderZone } from "./format";

const MIME_TYPE = "application/json";

/** `timestamp-20260729T120000Z.json` — sortable and self-describing. */
export function buildTimestampExportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `timestamp-${stamp}.json`;
}

/**
 * JSON rather than plain text: the payload is one instant told several ways,
 * which is a record, not a document. Every zone that was on screen is included
 * so the file matches what the reader was looking at.
 */
export function createTimestampExportFile(request: TimestampExportRequest): DownloadFile {
    const epochs = renderEpochs(request.epochMs, 0);
    const zones = request.timeZones.filter(isFormattableTimeZone);

    const payload = {
        input: request.input,
        epoch: epochs,
        zones: zones.map((timeZone) => {
            const rendering = renderZone(request.epochMs, timeZone, request.locale);

            return {
                timeZone,
                offset: rendering.offsetLabel,
                abbreviation: rendering.abbreviation,
                iso8601: rendering.iso8601,
                rfc2822: rendering.rfc2822,
                local: rendering.fullDate,
            };
        }),
        generatedAt: request.generatedAt.toISOString(),
    };

    return {
        filename: buildTimestampExportFilename(request.generatedAt),
        mimeType: MIME_TYPE,
        content: `${JSON.stringify(payload, null, 2)}\n`,
    };
}
