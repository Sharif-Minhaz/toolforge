import {
    MAX_DPI,
    MAX_PERCENTAGE,
    MAX_QUALITY,
    MIN_DPI,
    MIN_PERCENTAGE,
    MIN_QUALITY,
} from "./constants";
import { normalizeImageType } from "@/modules/tools/domain/image-file";
import type { OutputFormat, ResizeOptions } from "../types";
import type { RasterFormat } from "@/modules/tools/types";

/**
 * Which settings apply, and what the picker's answers actually mean.
 *
 * The one rule worth stating up front: **every predicate here is used twice** —
 * once to decide whether a control is enabled, once to decide whether the
 * renderer reads it. One answer to "does this setting apply", not two that can
 * drift apart, which is the trap the Image Converter's case study records.
 */

/**
 * What `original` resolves to.
 *
 * GIF and BMP are decodable and not writable, so both land on PNG — the
 * lossless choice, which is the right one for a tool whose promise is that it
 * changed as little as possible. Saying so in the UI matters: a reader who
 * dropped a GIF and got a PNG should not have to open the file to find out.
 */
export function resolveFormat(sourceType: string, format: OutputFormat): RasterFormat {
    if (format !== "original") {
        return format;
    }

    switch (normalizeImageType(sourceType)) {
        case "image/jpeg":
            return "jpeg";
        case "image/webp":
            return "webp";
        case "image/avif":
            return "avif";
        default:
            return "png";
    }
}

/** PNG here is OxiPNG, which is lossless — the slider would do nothing. */
export function qualityApplies(format: RasterFormat): boolean {
    return format !== "png";
}

export function isLosslessFormat(format: RasterFormat): boolean {
    return format === "png";
}

/** JPEG has no alpha channel, so transparency has to become a colour somewhere. */
export function supportsAlpha(format: RasterFormat): boolean {
    return format !== "jpeg";
}

export function clampQuality(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_QUALITY;
    }

    return Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, Math.round(value)));
}

export function clampPercentage(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_PERCENTAGE;
    }

    return Math.min(MAX_PERCENTAGE, Math.max(MIN_PERCENTAGE, Math.round(value)));
}

export function clampDpi(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_DPI;
    }

    return Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(value)));
}

/**
 * True when the background colour is doing something the reader can see.
 *
 * Three ways it can matter, and the control stays live if any of them holds:
 * `contain` may leave padding, `stretch` and `cover` may still be flattening a
 * transparent source, and JPEG has no alpha at all. It goes dead only when none
 * of them can apply — an opaque source filling its box exactly.
 */
export function backgroundApplies(
    fit: ResizeOptions["fit"],
    format: RasterFormat,
    sourceHasAlpha: boolean,
): boolean {
    return fit === "contain" || sourceHasAlpha || !supportsAlpha(format);
}
