/**
 * How the detector describes a picture. Kept as a literal union so message keys
 * such as `aiImageDetector.labels.ai-generated` stay statically checked.
 */
export const IMAGE_VERDICT_LABELS = ["ai-generated", "authentic", "unknown"] as const;

export type ImageVerdictLabel = (typeof IMAGE_VERDICT_LABELS)[number];

/**
 * The vision model reports its certainty as a word rather than a number, so the
 * band *is* the answer — there is no percentage to bucket. `unknown` is a real
 * outcome: it is what a reply the worker could not parse comes back as.
 */
export const IMAGE_CONFIDENCE_BANDS = ["low", "medium", "high", "unknown"] as const;

export type ImageConfidenceBand = (typeof IMAGE_CONFIDENCE_BANDS)[number];

export type ImageVerdict = {
    readonly label: ImageVerdictLabel;
    readonly band: ImageConfidenceBand;
    /** The model's own justification, whitespace-collapsed and capped. */
    readonly reasoning: string;
};

/**
 * Every way an analysis can fail, from the reader's point of view. The island
 * maps each one to a localised sentence; nothing here throws.
 */
export const IMAGE_DETECTION_FAILURE_REASONS = [
    "missing_image",
    "empty_file",
    "unsupported_type",
    "too_large",
    "invalid_request",
    "challenge_required",
    "challenge_failed",
    "rate_limited",
    "unauthorized",
    "not_configured",
    "upstream_unavailable",
    "unreadable_response",
] as const;

export type ImageDetectionFailureReason = (typeof IMAGE_DETECTION_FAILURE_REASONS)[number];

export type ImageDetectionFailure = {
    readonly ok: false;
    readonly reason: ImageDetectionFailureReason;
};

export type ImageDetectionResult =
    { readonly ok: true; readonly verdict: ImageVerdict } | ImageDetectionFailure;

/**
 * What the browser knows about the chosen file before anything is sent. The
 * pixel dimensions are `null` until the image has been decoded, and stay `null`
 * for a file the browser cannot decode at all.
 */
export type ImageFacts = {
    readonly name: string;
    /** MIME type as the browser reported it, lower-cased. */
    readonly type: string;
    readonly bytes: number;
    readonly width: number | null;
    readonly height: number | null;
};

export type ImageDetectionExportRequest = {
    readonly facts: ImageFacts;
    readonly verdict: ImageVerdict;
    readonly generatedAt: Date;
};
