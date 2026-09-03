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
 * Where the search starts on a still.
 *
 * Not the clip half's corner. Gemini signs a generated image with its sparkle in
 * the **bottom-left**, where Veo puts the mark on a clip in the bottom-right, and
 * a box planned against the wrong one opens on empty picture and finds nothing.
 * It is a starting point rather than a rule: the corner is a control, because
 * one generator moving its mark should cost the reader a click rather than cost
 * this file a release.
 */
export const GEMINI_DEFAULT_CORNER: BoxCorner = "bottom-left";
