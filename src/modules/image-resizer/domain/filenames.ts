import { RASTER_FORMAT_EXTENSIONS } from "@/modules/tools/domain/image-codec";
import { toFilenameStem } from "@/modules/tools/domain/filenames";
import type { PixelSize, RasterFormat } from "@/modules/tools/types";

/**
 * `holiday.jpg` cropped to 532 × 650 comes back as `holiday-532x650.png`.
 *
 * The size is in the name rather than a suffix like `-resized`, because the
 * common case is downloading the same photograph at three sizes for three
 * forms, and three files called `holiday-resized` tell nobody which is which.
 * The reader's own stem survives — Unicode included, since somebody who named a
 * file in Bangla should get that file back.
 */
export function buildOutputFilename(
    originalName: string,
    format: RasterFormat,
    size: PixelSize,
): string {
    return `${toFilenameStem(originalName)}-${size.width}x${size.height}.${RASTER_FORMAT_EXTENSIONS[format]}`;
}
