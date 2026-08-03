import { buildTimestampedFilename, toFilenameStem } from "@/modules/tools/domain/filenames";
import { RASTER_FORMAT_EXTENSIONS } from "@/modules/tools/domain/image-codec";
import type { RasterFormat } from "@/modules/tools/types";

/** `holiday-min.webp` — the reader's name, plus what happened to it. */
export function buildOutputFilename(originalName: string, format: RasterFormat): string {
    return `${toFilenameStem(originalName)}-min.${RASTER_FORMAT_EXTENSIONS[format]}`;
}

/** `toolforge-images-20260803T101500Z.zip` — sortable and self-describing. */
export function buildArchiveFilename(generatedAt: Date): string {
    return buildTimestampedFilename("images", generatedAt, "zip");
}
