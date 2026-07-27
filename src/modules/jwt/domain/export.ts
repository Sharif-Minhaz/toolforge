import type { DownloadFile } from "@/modules/tools/types";
import type { DecodedJwt, JwtExportRequest, JwtMode } from "../types";
import { JSON_INDENT } from "./constants";

const JSON_MIME_TYPE = "application/json;charset=utf-8";
const TEXT_MIME_TYPE = "text/plain;charset=utf-8";

/** `jwt-decoded-20260727T101500Z.json` — sortable and self-describing. */
export function buildJwtExportFilename(mode: JwtMode, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return mode === "decode" ? `jwt-decoded-${stamp}.json` : `jwt-encoded-${stamp}.txt`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

/**
 * The decoded token as one document. The signature is carried verbatim rather
 * than decoded — it is bytes, not text, and re-encoding it would be the one
 * part of the export that could not be checked against the original.
 */
export function buildDecodedDocument(decoded: DecodedJwt): string {
    return JSON.stringify(
        {
            header: decoded.header,
            payload: decoded.payload,
            signature: decoded.segments.signature,
        },
        null,
        JSON_INDENT,
    );
}

export function createJwtExportFile(request: JwtExportRequest): DownloadFile {
    return {
        filename: buildJwtExportFilename(request.mode, request.generatedAt),
        mimeType: request.mode === "decode" ? JSON_MIME_TYPE : TEXT_MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
