import type { DownloadFile, UuidExportFormat, UuidExportRequest, UuidVersion } from "../types";

const MIME_TYPES: Record<UuidExportFormat, string> = {
    txt: "text/plain;charset=utf-8",
    csv: "text/csv;charset=utf-8",
    json: "application/json;charset=utf-8",
};

export function getExportMimeType(format: UuidExportFormat): string {
    return MIME_TYPES[format];
}

/** `uuid-v4-25-20260727T101500Z.csv` — sortable and self-describing. */
export function buildExportFilename(
    format: UuidExportFormat,
    version: UuidVersion,
    count: number,
    generatedAt: Date,
): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `uuid-v${version}-${count}-${stamp}.${format}`;
}

function escapeCsvField(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function serializeUuids(request: UuidExportRequest): string {
    const { uuids, version, format, generatedAt } = request;

    switch (format) {
        case "txt":
            return uuids.length > 0 ? `${uuids.join("\n")}\n` : "";

        case "csv": {
            const rows = uuids.map(
                (uuid, index) => `${index + 1},${escapeCsvField(uuid)},${version}`,
            );

            return `index,uuid,version\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
        }

        case "json":
            return `${JSON.stringify(
                {
                    generator: "ToolForge",
                    version,
                    count: uuids.length,
                    generatedAt: generatedAt.toISOString(),
                    uuids,
                },
                null,
                2,
            )}\n`;
    }
}

export function createExportFile(request: UuidExportRequest): DownloadFile {
    return {
        filename: buildExportFilename(
            request.format,
            request.version,
            request.uuids.length,
            request.generatedAt,
        ),
        mimeType: getExportMimeType(request.format),
        content: serializeUuids(request),
    };
}
