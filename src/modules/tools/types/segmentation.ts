/**
 * Which weights the subject-segmentation model runs with.
 *
 * Shared rather than owned by the Background Remover: two tools now ask the same
 * model the same question — "which pixels are the subject" — and one of them
 * wants the answer to cut a photograph out while the other wants it to decide
 * what to inflate into a solid. A second copy of this table would be a second
 * place for the byte counts to go stale.
 */
export const CUTOUT_QUALITIES = ["fast", "balanced", "best"] as const;

export type CutoutQuality = (typeof CUTOUT_QUALITIES)[number];

/**
 * How segmentation can fail, as two states rather than one — `CLAUDE.md` rule 28.
 *
 * "The weights did not download" is answered by trying again on a better
 * connection; "the model threw" is not.
 */
export type SegmentationFailureReason = "model_unavailable" | "removal_failed";

export type SegmentationPhase = "download" | "compute";

export type SegmentationProgress = {
    readonly phase: SegmentationPhase;
    /** 0–1. Never `NaN`, whatever the library reports. */
    readonly ratio: number;
};
