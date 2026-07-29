/** A point in whatever coordinate space the caller names, never a mix of two. */
export type Point = {
    readonly x: number;
    readonly y: number;
};

export type PixelSize = {
    readonly width: number;
    readonly height: number;
};

/** The slice of `DOMRect` the pointer maths needs, so it is testable without one. */
export type BoxRect = {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
};

/**
 * One drag of the brush. Points and radius are both in *image* pixels, converted
 * the moment the pointer moved: a window resize between two strokes then cannot
 * bend the first one.
 */
export type MaskStroke = {
    readonly radius: number;
    readonly points: readonly Point[];
};

/** An axis-aligned box in image pixels. */
export type MaskBounds = {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
};

/**
 * The square of the original the model is asked to repaint. Square by
 * construction, so nothing is ever stretched on the way there or back, and small
 * enough to keep the watermark near native resolution inside the model's 512 px
 * canvas.
 */
export type RemovalRegion = {
    readonly x: number;
    readonly y: number;
    readonly side: number;
};

/**
 * Every way a removal can fail, from the reader's point of view. The island maps
 * each one to a localised sentence; nothing here throws.
 */
export const WATERMARK_FAILURE_REASONS = [
    "missing_image",
    "missing_mask",
    "empty_file",
    "unsupported_type",
    "too_large",
    "empty_mask",
    "invalid_request",
    "challenge_required",
    "challenge_failed",
    "rate_limited",
    "unauthorized",
    "not_configured",
    "upstream_unavailable",
    "unreadable_response",
    "oversized_result",
    "compose_failed",
] as const;

export type WatermarkFailureReason = (typeof WATERMARK_FAILURE_REASONS)[number];

export type WatermarkFailure = {
    readonly ok: false;
    readonly reason: WatermarkFailureReason;
};

/** The repainted square, as the worker returned it. */
export type RepaintedPatch = {
    /** `data:image/png;base64,…` — the only shape a file crosses back in. */
    readonly dataUrl: string;
    readonly bytes: number;
};

export type WatermarkRemovalResult =
    { readonly ok: true; readonly patch: RepaintedPatch } | WatermarkFailure;

/** What the browser knows about the chosen file before anything is sent. */
export type SourceImageFacts = {
    readonly name: string;
    /** MIME type as the browser reported it, lower-cased. */
    readonly type: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
};
