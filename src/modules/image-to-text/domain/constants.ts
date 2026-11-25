import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";
import type { OcrLanguage, ResultLayout } from "../types";

export const DEFAULT_LANGUAGE: OcrLanguage = "eng";

/** Separate first: a reader checks a picture against its own text before copying. */
export const DEFAULT_RESULT_LAYOUT: ResultLayout = "separate";

/** Per file. Everything is decoded in this tab, so the ceiling is memory. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * Pictures above this are scaled down before recognition rather than refused.
 * A 4K screenshot (8.3 MP) reads at full size; past it, Tesseract only gets
 * slower, because text that small is not on a camera photograph anyway.
 */
export const MAX_RECOGNITION_PIXELS = 8_300_000;

/**
 * Longest silence from the engine before a run fails. Tesseract reports
 * progress while it reads, but not while it downloads: the engine is one
 * 3.9 MB file with no progress events in between, which is 80 seconds on a
 * slow mobile connection. A worker that crashed, or a language file that never
 * arrived, settles nothing at all — this is what turns that into an answer.
 */
export const STALL_MS = 120_000;

/**
 * Pictures held at once. They are read one after another by a single worker,
 * so the ceiling is the previews' memory and a reader's patience, not the engine.
 */
export const MAX_IMAGES = 20;

export const IMAGE_FILE_LIMITS = {
    allowedTypes: DECODABLE_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly DecodableImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = DECODABLE_IMAGE_TYPES.join(",");
