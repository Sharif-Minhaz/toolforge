/**
 * How the detector describes a passage. Kept as a literal union so message
 * keys such as `aiTextDetector.labels.ai-generated` stay statically checked.
 */
export const DETECTION_LABELS = ["ai-generated", "human-written", "mixed", "unknown"] as const;

export type DetectionLabel = (typeof DETECTION_LABELS)[number];

/** Confidence bucketed for display, so the copy never reads "51% sure". */
export const CONFIDENCE_BANDS = ["low", "moderate", "high"] as const;

export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export type DetectionVerdict = {
    readonly label: DetectionLabel;
    /** Integer 0–100. */
    readonly confidence: number;
    readonly band: ConfidenceBand;
    /** The model's own justification, trimmed to a readable length. */
    readonly reasoning: string;
    /** Identifier of the model that answered, e.g. `@cf/meta/llama-3.1-8b-instruct-fast`. */
    readonly model: string;
};

/**
 * Every way an analysis can fail, from the reader's point of view. The island
 * maps each one to a localised sentence; nothing here throws.
 */
export const DETECTION_FAILURE_REASONS = [
    "empty",
    "too_short",
    "too_long",
    "blocked_language",
    "invalid_request",
    "challenge_required",
    "challenge_failed",
    "rate_limited",
    "unauthorized",
    "not_configured",
    "upstream_unavailable",
    "unreadable_response",
] as const;

export type DetectionFailureReason = (typeof DETECTION_FAILURE_REASONS)[number];

export type DetectionFailure = {
    readonly ok: false;
    readonly reason: DetectionFailureReason;
};

export type DetectionResult =
    { readonly ok: true; readonly verdict: DetectionVerdict } | DetectionFailure;

/** Offline signals computed in the browser, shown before anything is sent. */
export type TextMetrics = {
    readonly characters: number;
    readonly words: number;
    readonly sentences: number;
    /** Mean words per sentence, to one decimal place. */
    readonly averageSentenceWords: number;
    /** Distinct words as a percentage of all words, rounded. */
    readonly uniqueWordRatio: number;
};

export type DetectionExportRequest = {
    readonly text: string;
    readonly verdict: DetectionVerdict;
    readonly metrics: TextMetrics;
    readonly generatedAt: Date;
};
