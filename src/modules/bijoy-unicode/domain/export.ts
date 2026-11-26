import { buildTimestampedFilename } from "@/modules/tools/domain/filenames";
import type { DownloadFile } from "@/modules/tools/types";
import type { BijoyExportRequest } from "../types";

const MIME_TYPE = "text/plain;charset=utf-8";

/** `toolforge-bangla-unicode-20261126T101500Z.txt` — says which encoding is inside. */
export function buildBijoyExportFilename(
    request: Pick<BijoyExportRequest, "direction" | "generatedAt">,
): string {
    const label = request.direction === "to-unicode" ? "bangla-unicode" : "bangla-bijoy";

    return buildTimestampedFilename(label, request.generatedAt, "txt");
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

/**
 * Both directions are saved as UTF-8. A Bijoy file is "really" Windows-1252,
 * but every editor that opens a `.txt` today reads UTF-8, and a SutonnyMJ font
 * draws the same glyph from either — the characters are what matter, not the
 * bytes that carried them.
 */
export function createBijoyExportFile(request: BijoyExportRequest): DownloadFile {
    return {
        filename: buildBijoyExportFilename(request),
        mimeType: MIME_TYPE,
        content: withTrailingNewline(request.content),
    };
}
