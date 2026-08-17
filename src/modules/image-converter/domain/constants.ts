import { DECODABLE_IMAGE_TYPES } from "@/modules/tools/types";
import { SVG_MIME_TYPE } from "./svg-source";
import type { ColorCount, ConversionOptions, IconSize } from "../types";

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

/**
 * The types this tool takes in, which is one wider than `DECODABLE_IMAGE_TYPES`.
 *
 * SVG is not on the shared list on purpose: it is not decoded like the others.
 * It is markup, rendered by the browser at a size this tool chooses, and only
 * this tool has a reason to want that — the compressor has nothing to compress,
 * and the URL importer refuses it for a separate reason of its own. Rule 40's
 * second branch: exactly one feature needs it, so it stays here.
 */
export const ACCEPTED_IMAGE_TYPES = [...DECODABLE_IMAGE_TYPES, SVG_MIME_TYPE] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const IMAGE_FILE_LIMITS = {
    allowedTypes: ACCEPTED_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly AcceptedImageType[]; maxBytes: number };

/**
 * `.svg` rides along with the MIME type because a few platforms hand a dragged
 * `.svg` over with an empty or generic type, and the picker would otherwise grey
 * out a file this tool accepts.
 */
export const IMAGE_ACCEPT_ATTRIBUTE = [...ACCEPTED_IMAGE_TYPES, ".svg"].join(",");

/**
 * Longest-edge presets, largest first. `null` keeps the original size and is
 * rendered as its own entry rather than as a magic number.
 */
export const RESIZE_EDGES = [null, 3840, 2560, 1920, 1280, 800, 512] as const;

export type ResizeEdge = (typeof RESIZE_EDGES)[number];

/** The three sizes Windows and every browser actually read out of an `.ico`. */
export const DEFAULT_ICON_SIZES: readonly IconSize[] = [16, 32, 48];

/**
 * The grid a trace runs on, whatever size the picture arrived at.
 *
 * Tracing costs work per *region*, and a bigger grid does not find bigger
 * shapes — it finds the same shapes plus every speck of sensor noise, each of
 * which becomes its own outline. A thousand pixels on the longest edge is where
 * a logo has every curve it is ever going to have, and past it the file grows
 * without the drawing improving. Unlike the size cap, this one is not a control:
 * the output is a vector and scales to any size regardless.
 */
export const MAX_TRACE_EDGE = 1_000;

/**
 * Enough for a flat illustration without turning a two-colour logo into a
 * gradient. Small enough that the first trace anyone runs finishes quickly.
 */
export const DEFAULT_COLORS: ColorCount = 16;

export const DEFAULT_OPTIONS: ConversionOptions = {
    target: "webp",
    quality: DEFAULT_QUALITY,
    maxEdge: null,
    background: "transparent",
    iconSizes: DEFAULT_ICON_SIZES,
    colors: DEFAULT_COLORS,
};
