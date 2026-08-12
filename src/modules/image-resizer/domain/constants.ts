import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";
import type { ResizeOptions } from "../types";

export const MIN_QUALITY = 10;
export const MAX_QUALITY = 100;

/**
 * Higher than the compressor's 75 and the converter's 80. Somebody here has
 * asked to *keep* a picture and take part of it away — a visible re-encode
 * artefact is the one thing that would make the answer wrong.
 */
export const DEFAULT_QUALITY = 92;

/** Per file. Everything is decoded in this tab, so the ceiling is memory. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * A 40 MP cap on the source, checked after decoding rather than from the file
 * size: a 2 MB PNG can hold 100 megapixels, and four bytes a pixel is what
 * actually has to fit in the tab.
 */
export const MAX_PIXELS = 40_000_000;

/**
 * The same ceiling on the *output*, which the source cap does not imply: a 1%
 * crop scaled to 20000 × 20000 starts from almost nothing and still asks for
 * 1.6 GB. Enforced before the canvas is allocated rather than after, because
 * "after" is a dead tab.
 */
export const MAX_OUTPUT_PIXELS = 40_000_000;

/** Nothing below this can be dragged accurately, and nothing below 1 can exist. */
export const MIN_CROP_SIZE = 1;

export const MIN_DIMENSION = 1;

export const MAX_DIMENSION = 20_000;

export const MIN_PERCENTAGE = 1;

export const MAX_PERCENTAGE = 400;

/**
 * Print resolutions. 300 is what every passport office and photo lab means by
 * "print quality", which is why it is the default rather than the screen's 96.
 */
export const DPI_PRESETS = [72, 96, 150, 300, 600] as const;

export const DEFAULT_DPI = 300;

export const MIN_DPI = 1;

export const MAX_DPI = 2_400;

export const IMAGE_FILE_LIMITS = {
    allowedTypes: DECODABLE_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly DecodableImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = DECODABLE_IMAGE_TYPES.join(",");

/** White, because a document photo on a black background is a rejected form. */
export const DEFAULT_BACKGROUND_COLOR = "#ffffff";

export const DEFAULT_OPTIONS: ResizeOptions = {
    mode: "dimensions",
    width: null,
    height: null,
    unit: "px",
    dpi: DEFAULT_DPI,
    percentage: 100,
    presetId: "bd-passport",
    lockAspect: true,
    // `contain` rather than `cover`, because the first thing this tool must
    // never do is cut somebody's head off to fill a box they typed.
    fit: "contain",
    background: "color",
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    format: "original",
    quality: DEFAULT_QUALITY,
    embedDensity: true,
};
