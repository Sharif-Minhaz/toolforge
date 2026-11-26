import type { TextStats } from "@/modules/tools/types";

/**
 * Which way the text is going.
 *
 * Named for the destination, because that is the question a reader is
 * answering: "I have a SutonnyMJ document and want text that works anywhere"
 * is `to-unicode`, and "I have Unicode and a designer who only has Bijoy
 * fonts" is `to-bijoy`.
 */
export const BIJOY_DIRECTIONS = ["to-unicode", "to-bijoy"] as const;

export type BijoyDirection = (typeof BIJOY_DIRECTIONS)[number];

export type BijoyFailureReason = "too_long";

export type BijoyFailure = {
    readonly ok: false;
    readonly reason: BijoyFailureReason;
};

/**
 * What the converter noticed about its input that the reader should hear
 * about. Neither is a refusal: the text is still converted, because a passage
 * that mixes the two encodings is real, and refusing it would leave the reader
 * with nothing.
 */
export type BijoyNotice =
    /** Going to Unicode, but the input already holds Bangla Unicode letters. */
    | "already_unicode"
    /** Going to Bijoy, but there is not one Bangla letter in the input. */
    | "no_bangla";

export type BijoySuccess = {
    readonly ok: true;
    readonly text: string;
    readonly stats: TextStats;
    readonly notice: BijoyNotice | null;
};

export type BijoyResult = BijoySuccess | BijoyFailure;

export type BijoyExportRequest = {
    readonly content: string;
    readonly direction: BijoyDirection;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
