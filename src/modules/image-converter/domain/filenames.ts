import { buildTimestampedFilename, toFilenameStem } from "@/modules/tools/domain/filenames";
import { RASTER_FORMAT_EXTENSIONS } from "@/modules/tools/domain/image-codec";
import { targetFormat } from "./targets";
import type { ConversionTarget } from "../types";

/**
 * What a single-file conversion downloads as.
 *
 * No suffix, unlike the compressor's `-min`: the extension already says what
 * changed, and a converter that renames the file makes the reader rename it
 * back. A source that is already the target format still round-trips to the
 * same name, which is correct — it is the same picture, re-encoded.
 */
export function buildConvertedFilename(originalName: string, target: ConversionTarget): string {
    return `${toFilenameStem(originalName)}.${targetExtension(target)}`;
}

/**
 * The extension a target's single file takes. The favicon pack is the exception
 * and does not go through here: every file in it names itself, because a
 * browser looks those names up by path.
 */
export function targetExtension(target: ConversionTarget): string {
    const format = targetFormat(target);

    if (format !== null) {
        return RASTER_FORMAT_EXTENSIONS[format];
    }

    return target === "svg" ? "svg" : "ico";
}

/** `holiday-favicon.zip` — one source's whole pack, named after the source. */
export function buildPackFilename(originalName: string): string {
    return `${toFilenameStem(originalName)}-favicon.zip`;
}

/** `toolforge-converted-20260803T101500Z.zip` — sortable and self-describing. */
export function buildArchiveFilename(generatedAt: Date): string {
    return buildTimestampedFilename("converted", generatedAt, "zip");
}
