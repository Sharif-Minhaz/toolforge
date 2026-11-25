import type { ImageFileLimits } from "@/modules/tools/domain/image-file";
import type { BoxCorner } from "../types";

/**
 * What the Gemini half will take. Wider than the picture half's list, and for
 * the opposite reason: that one mirrors what a worker's pipeline decodes, while
 * this one only has to be something the reader's own browser can turn into
 * pixels. AVIF is in for that reason — a browser that cannot decode it says so
 * as `undecodable`, which is a truthful refusal rather than a guess made up
 * front.
 */
export const GEMINI_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type GeminiImageType = (typeof GEMINI_IMAGE_TYPES)[number];

/** `accept` for the file input — a hint to the picker, never a substitute for the check. */
export const GEMINI_ACCEPT_ATTRIBUTE = GEMINI_IMAGE_TYPES.join(",");

/**
 * Ceiling on the file. Nothing is uploaded, so this is not a bandwidth budget —
 * it is the point past which decoding to RGBA, holding a second copy for the
 * fill and encoding a PNG back out stops being something a browser tab can do
 * without being killed for it. A generated still is a couple of megabytes; this
 * leaves room for a scan or an upscale and refuses a scanner's TIFF-sized PNG.
 */
export const MAX_GEMINI_IMAGE_BYTES = 32 * 1024 * 1024;

export const GEMINI_IMAGE_FILE_LIMITS: ImageFileLimits<GeminiImageType> = {
    allowedTypes: GEMINI_IMAGE_TYPES,
    maxBytes: MAX_GEMINI_IMAGE_BYTES,
};

/**
 * Where the box sits while the search is still running, and where it falls back
 * to when nothing was found anywhere.
 *
 * Not a claim about where a generator signs. The tool measures all four corners
 * on the first run — `scanGeminiCorners` in `gemini-image.ts` — precisely
 * because that is a fact about the generator's version rather than about the
 * file, and a wrong default meant `mark_not_found` on a picture that plainly had
 * a mark in it. This is only the placeholder the preview needs before the answer
 * exists, and the corner a reader starts correcting from when there is no
 * answer at all.
 */
export const GEMINI_FALLBACK_CORNER: BoxCorner = "bottom-right";

/**
 * Where Gemini signs a still, in the still's own pixels: a 48 px sparkle at a
 * 32 px margin from both edges, or 96 px at 64 once both sides pass 1024.
 *
 * Not the clip calibration. `WATERMARK_INSET_RATIO` was measured on Veo clips,
 * where the mark centres 0.17 of the short side in; on a still it centres 56 px
 * in (measured on a 1061x1008 still: 56 and 55 px). Searching a still at the
 * clip's inset put the sparkle against the box wall and the box over whatever
 * else filled the corner, and a bright patch elsewhere outscored the real mark.
 */
export const GEMINI_LOGO_PX = 48;
export const GEMINI_MARGIN_PX = 32;
export const GEMINI_LARGE_LOGO_PX = 96;
export const GEMINI_LARGE_MARGIN_PX = 64;
/** Both sides above this and the still carries the large sparkle. */
export const GEMINI_LARGE_IMAGE_PX = 1024;

/**
 * Side of the box each corner is searched in, as a multiple of the logo. Tight on
 * purpose: it is the only size that kept the right corner winning on a still
 * downscaled to under half size, where the mark is smaller than the geometry
 * says and a roomier box takes in enough other picture to outscore it.
 */
export const GEMINI_SEARCH_BOX_RATIO = 2;

/**
 * Side of the box the chosen corner is cleaned in. More ring around the mark
 * gives the background estimate more to read: on a full-size still the residual
 * over the core fell from 7 levels at the search size to 2.3 at this one.
 */
export const GEMINI_CLEAN_BOX_RATIO = 2.5;
