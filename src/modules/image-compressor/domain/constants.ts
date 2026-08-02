import type { CompressionOptions, SourceImageType } from "../types";
import { SOURCE_IMAGE_TYPES } from "../types";

export const MIN_QUALITY = 10;
export const MAX_QUALITY = 100;

/**
 * MozJPEG's own default, and close to where libwebp stops paying for itself.
 * High enough that a photograph survives a side-by-side comparison, low enough
 * that the first result is a real saving rather than a rounding error.
 */
export const DEFAULT_QUALITY = 75;

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
    allowedTypes: SOURCE_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly SourceImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = SOURCE_IMAGE_TYPES.join(",");

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

/**
 * MozJPEG, tuned past its defaults.
 *
 * Trellis quantisation searches for the coefficient set with the best
 * rate-distortion trade at the requested quality instead of taking the first
 * one the quantiser produces — it is the single biggest reason to run MozJPEG
 * rather than the browser's `canvas.toBlob`, and it is off by default because
 * it costs encode time. Three loops is where the returns flatten. `quant_table:
 * 3` is Squoosh's ImageMagick table, which holds detail better than the JPEG
 * annex tables on photographs.
 */
export const JPEG_ENCODE_OPTIONS = {
    progressive: true,
    optimize_coding: true,
    trellis_multipass: true,
    trellis_opt_zero: true,
    trellis_opt_table: true,
    trellis_loops: 3,
    quant_table: 3,
    auto_subsample: true,
    smoothing: 0,
} as const;

/**
 * libwebp at its slowest analysis setting.
 *
 * `method: 6` and `pass: 6` spend more time choosing filters and partitions;
 * `use_sharp_yuv` fixes the coloured fringing plain 4:2:0 leaves on saturated
 * edges — the failure most often mistaken for "WebP looks worse than JPEG".
 */
export const WEBP_ENCODE_OPTIONS = {
    method: 6,
    pass: 6,
    use_sharp_yuv: 1,
    alpha_quality: 100,
    sns_strength: 50,
    filter_strength: 60,
} as const;

/**
 * libaom, one step slower than its default. `speed: 5` is the practical floor
 * in WebAssembly — below it a large photograph takes long enough that the tab
 * looks broken. `chromaDeltaQ` spends bits on chroma where the eye is most
 * sensitive to it, and `enableSharpYUV` is the AVIF twin of the WebP setting
 * above.
 */
export const AVIF_ENCODE_OPTIONS = {
    speed: 5,
    subsample: 1,
    chromaDeltaQ: true,
    enableSharpYUV: true,
    sharpness: 0,
    tune: 0,
} as const;

/**
 * OxiPNG effort. PNG is lossless here, so this buys size and nothing else;
 * level 3 finds most of what level 6 does in a fraction of the time.
 */
export const PNG_OPTIMISE_OPTIONS = {
    level: 3,
    interlace: false,
    optimiseAlpha: true,
} as const;

/** Lanczos3, in linear light with premultiplied alpha — Squoosh's own default. */
export const RESIZE_OPTIONS = {
    method: "lanczos3",
    fitMethod: "stretch",
    premultiply: true,
    linearRGB: true,
} as const;

/** Flattening colour for a transparent image on its way into a JPEG. */
export const JPEG_MATTE_RGB = { r: 255, g: 255, b: 255 } as const;
