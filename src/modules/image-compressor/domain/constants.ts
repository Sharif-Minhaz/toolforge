import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";
import type { CompressionOptions } from "../types";

export const MIN_QUALITY = 10;
export const MAX_QUALITY = 100;

/**
 * The top of the scale, so nothing is thrown away until the reader chooses to.
 * The saving at 100 comes from the encoder, the format and the size cap; the
 * article says where to take the slider for more.
 */
export const DEFAULT_QUALITY = 100;

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
export const RESIZE_EDGES = [null, 3840, 2560, 1920, 1280, 800] as const;

export type ResizeEdge = (typeof RESIZE_EDGES)[number];

export const DEFAULT_OPTIONS: CompressionOptions = {
    quality: DEFAULT_QUALITY,
    format: "auto",
    maxEdge: null,
};
