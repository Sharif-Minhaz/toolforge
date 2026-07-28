import type { ColorFormatOptions, Hsva } from "../types";

/**
 * Opens on a violet with obvious hue and saturation, so the picker, the scale,
 * and the contrast panel all show something meaningful before the first edit.
 */
export const DEFAULT_COLOR: Hsva = { h: 252, s: 64, v: 100, a: 1 };

export const DEFAULT_FORMAT_OPTIONS: ColorFormatOptions = {
    notation: "modern",
    hexCasing: "lower",
};

/**
 * Ceiling on a pasted value. The longest thing the parser accepts is an OKLCH
 * function carrying an alpha, well under a hundred characters — anything longer
 * is a paste of something that is not a colour.
 */
export const MAX_COLOR_INPUT_LENGTH = 128;

/**
 * OKLab ΔE below which two colours are treated as the same swatch. One 8-bit
 * channel step is roughly 0.004 in OKLab, so this only absorbs rounding.
 */
export const TAILWIND_EXACT_MATCH_DISTANCE = 0.005;

/**
 * The Tailwind family whose lightness and chroma ladder a generated scale
 * borrows. Read from the palette itself rather than transcribed, so upgrading
 * Tailwind moves the ladder with it.
 */
export const SCALE_REFERENCE_FAMILY = "red";
