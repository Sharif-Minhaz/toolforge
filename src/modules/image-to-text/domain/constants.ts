import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";
import type { OcrLanguage } from "../types";

export const DEFAULT_LANGUAGE: OcrLanguage = "eng";

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

export const IMAGE_FILE_LIMITS = {
    allowedTypes: DECODABLE_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
} as const satisfies { allowedTypes: readonly DecodableImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = DECODABLE_IMAGE_TYPES.join(",");

/**
 * Gzipped `4.0.0_best_int` traineddata as jsDelivr serves it, read from
 * `data.jsdelivr.com/v1/packages/npm/@tesseract.js-data/<code>@1.0.0?structure=flat`
 * rather than estimated — the number is shown to the reader before they commit.
 */
export const LANGUAGE_DATA_BYTES: Record<OcrLanguage, number> = {
    eng: 2_952_873,
    spa: 2_100_190,
    hin: 1_389_692,
    ben: 1_373_429,
    ara: 1_661_906,
    chi_sim: 1_718_768,
    chi_tra: 1_656_239,
    jpn: 2_030_256,
};

/**
 * `tesseract.js@7.0.0`'s worker (111,307 bytes) plus the largest of the three
 * `tesseract.js-core@7.0.0` LSTM builds it picks between by CPU support
 * (relaxed-SIMD, 3,905,767 bytes). Same source as above.
 */
export const ENGINE_BYTES = 111_307 + 3_905_767;
