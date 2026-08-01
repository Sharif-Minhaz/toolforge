import type { DownloadFile } from "@/modules/tools/types";
import type { QrExportFormat, QrPayloadKind } from "../types";

const SVG_MIME_TYPE = "image/svg+xml;charset=utf-8";

/** `qr-wifi-20260801T101500Z.png` — sortable, and says what it encodes. */
export function buildQrFilename(
    kind: QrPayloadKind,
    format: QrExportFormat,
    generatedAt: Date,
): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `qr-${kind}-${stamp}.${format}`;
}

export type QrSvgExportRequest = {
    readonly kind: QrPayloadKind;
    readonly svg: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};

export function createQrSvgFile(request: QrSvgExportRequest): DownloadFile {
    return {
        filename: buildQrFilename(request.kind, "svg", request.generatedAt),
        mimeType: SVG_MIME_TYPE,
        // An SVG written to disk is a document rather than a fragment, so it
        // carries the XML declaration a bare inline string does not need.
        content: `<?xml version="1.0" encoding="UTF-8"?>\n${request.svg}\n`,
    };
}
