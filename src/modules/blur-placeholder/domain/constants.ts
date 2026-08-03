import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";
import type { BlurPlaceholderOptions } from "../types";

export const MIN_COMPONENTS = 1;

/**
 * Nine is the format's own ceiling, not a choice: the size flag is one base83
 * character holding `(x − 1) + (y − 1) × 9`, so a tenth column has nowhere to
 * go.
 */
export const MAX_COMPONENTS = 9;

export const MIN_PUNCH = 0.5;
export const MAX_PUNCH = 3;
export const PUNCH_STEP = 0.5;

export const DEFAULT_OPTIONS: BlurPlaceholderOptions = {
    componentX: 4,
    componentY: 3,
    punch: 1,
    edge: 32,
    ratio: "3:2",
};

/**
 * How much of the source the transform actually sees.
 *
 * The cost of encoding is width × height × componentX × componentY, so handing
 * a camera original to a 9 × 9 transform is hundreds of millions of basis
 * evaluations and a frozen tab: measured at 1200 × 630 it is 188 ms for 4 × 3
 * alone. At this edge the same picture is 31 ms at 9 × 9, and the downscale is
 * Lanczos3 in linear light — the same space the transform averages in — so what
 * it removes is above the frequency 81 coefficients could have carried anyway.
 */
export const ENCODE_EDGE = 256;

/**
 * Longest edge the preview is painted at.
 *
 * Deliberately not the placeholder's own size. The `blurDataURL` is 32 pixels
 * across because it is inlined into your HTML, and letting the browser stretch
 * those 32 pixels twenty times over is bilinear interpolation of a curve rather
 * than the curve — visible faceting, and it hides what raising the detail
 * bought you. A hash is a continuous function, so painting it at display size
 * is simply the truthful rendering; it costs 12 ms.
 */
export const PREVIEW_EDGE = 384;

/** Per file. Everything is decoded in this tab, so the ceiling is memory. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Checked after decoding: four bytes a pixel is what has to fit, not the file. */
export const MAX_PIXELS = 40_000_000;

export const IMAGE_FILE_LIMITS = {
    allowedTypes: DECODABLE_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly DecodableImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = DECODABLE_IMAGE_TYPES.join(",");

/** Exactly as long as a hash can be: `4 + 2 × 9 × 9`. Anything longer is not one. */
export const MAX_HASH_LENGTH = 4 + 2 * MAX_COMPONENTS * MAX_COMPONENTS;
