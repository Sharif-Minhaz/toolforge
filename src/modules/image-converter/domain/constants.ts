import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";
import type { ConversionOptions, IconSize } from "../types";

export const MIN_QUALITY = 10;
export const MAX_QUALITY = 100;

/**
 * Higher than the compressor's 75, because the jobs are different. Someone
 * compressing has asked for a smaller file; someone converting has asked for a
 * different format and expects the picture to survive the trip, including when
 * the source was already lossy and the re-encode compounds with it.
 */
export const DEFAULT_QUALITY = 80;

export const MAX_FILES = 40;

/** Per file. Everything is decoded in this tab, so the ceiling is memory. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * A 40 MP cap, checked after decoding rather than from the file size: a 2 MB
 * PNG can hold 100 megapixels, and four bytes per pixel is what actually has to
 * fit in the tab.
 */
export const MAX_PIXELS = 40_000_000;

export const IMAGE_FILE_LIMITS = {
    allowedTypes: DECODABLE_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly DecodableImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = DECODABLE_IMAGE_TYPES.join(",");

/**
 * Longest-edge presets, largest first. `null` keeps the original size and is
 * rendered as its own entry rather than as a magic number.
 */
export const RESIZE_EDGES = [null, 3840, 2560, 1920, 1280, 800, 512] as const;

export type ResizeEdge = (typeof RESIZE_EDGES)[number];

/** The three sizes Windows and every browser actually read out of an `.ico`. */
export const DEFAULT_ICON_SIZES: readonly IconSize[] = [16, 32, 48];

export const DEFAULT_OPTIONS: ConversionOptions = {
    target: "webp",
    quality: DEFAULT_QUALITY,
    maxEdge: null,
    background: "transparent",
    iconSizes: DEFAULT_ICON_SIZES,
};
