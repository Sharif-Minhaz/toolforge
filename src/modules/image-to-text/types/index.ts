import type { ImageFileRejection } from "@/modules/tools/domain/image-file";

/**
 * The languages a picture can be read in, as Tesseract's own codes.
 *
 * Literal, so `imageToText.languages.<code>` stays a checked message key and
 * the server and the client render the same option list.
 */
export const OCR_LANGUAGES = [
    "eng",
    "spa",
    "hin",
    "ben",
    "ara",
    "chi_sim",
    "chi_tra",
    "jpn",
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

/** What the engine is doing, as far as the reader needs to know. */
export type OcrPhase = "loading" | "recognizing";

export type OcrProgress = {
    readonly phase: OcrPhase;
    /** 0–1 within the phase. */
    readonly ratio: number;
};

export type OcrFailureReason =
    | ImageFileRejection
    /** The browser could not decode the file into pixels. */
    | "undecodable"
    /** The engine or its language data never arrived — offline, or a blocked CDN. */
    | "engine_unavailable"
    /** The engine went quiet for longer than `STALL_MS`. */
    | "stalled"
    | "recognition_failed";

export type OcrFailure = {
    readonly ok: false;
    readonly reason: OcrFailureReason;
    /** The engine's own message, for the log only — never rendered. */
    readonly detail?: string;
};

export type OcrResult = { readonly ok: true; readonly text: string } | OcrFailure;
