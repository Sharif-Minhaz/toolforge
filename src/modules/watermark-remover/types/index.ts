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

/** The two halves of the tool, as a literal union so the tab labels type-check. */
export const WATERMARK_MODES = ["image", "video"] as const;

export type WatermarkMode = (typeof WATERMARK_MODES)[number];

/**
 * The search box, stored against the frame rather than against a screen.
 *
 * `x` and `y` are the top-left corner as shares of the frame's width and height;
 * `side` is the square's edge as a share of the frame's *shorter* side, which is
 * what keeps one number describing a square on a portrait clip and a landscape
 * one alike.
 */
export type NormalizedBox = {
    readonly x: number;
    readonly y: number;
    readonly side: number;
};

/** An axis-aligned rectangle in whole image pixels. */
export type PixelBox = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

/**
 * What the detector worked out about the mark, over the search box.
 *
 * Not a mask but an **opacity map**, and that distinction is the whole quality
 * of the result. A sparkle is not a hole punched in the picture; it is white
 * laid over it at a strength that falls off from the core to nothing. Knowing
 * that strength per pixel means the footage underneath can be recovered rather
 * than invented — `o = (1 − a)·b + a·W` has one unknown left once `a` is known.
 *
 * `opaque` is the small remainder where `a` is so near 1 that the division stops
 * being stable; only those pixels are rebuilt from their surroundings.
 */
export type WatermarkProfile = {
    /** Per-pixel opacity of the mark, 0–1, in the search box's own coordinates. */
    readonly alpha: Float32Array;
    /** `1` where the mark is effectively solid and has to be repainted instead. */
    readonly opaque: Uint8Array;
    /** `1` wherever the mark reaches at all, which is what the work rect is cut from. */
    readonly touched: Uint8Array;
    /** Share of the search box the mark reaches. */
    readonly coverage: number;
    /** How far the brightest found pixel stood above its surroundings, in luma. */
    readonly peak: number;
};

export type WatermarkDetection =
    | { readonly ok: true; readonly profile: WatermarkProfile }
    | { readonly ok: false; readonly reason: "mark_not_found" };

/**
 * Every way the video half can refuse, from the reader's point of view. Nothing
 * here throws; the island maps each one to a localised sentence.
 *
 * These are separate from the image half's reasons on purpose. The two halves
 * fail at different things — one at a worker over the network, the other at the
 * browser's own codecs — and a shared list would have to be a union of two
 * vocabularies where every entry is unreachable from one side.
 */
export const VIDEO_FAILURE_REASONS = [
    "missing_video",
    "empty_file",
    "unsupported_type",
    "too_large",
    "too_long",
    "unsupported_browser",
    "unreadable_container",
    "no_video_track",
    "undecodable",
    "no_encoder",
    "mark_not_found",
    "clean_failed",
    "canceled",
] as const;

export type VideoFailureReason = (typeof VIDEO_FAILURE_REASONS)[number];

export type VideoFailure = {
    readonly ok: false;
    readonly reason: VideoFailureReason;
    /**
     * What the codec, demuxer or muxer actually said, truncated, for the log.
     *
     * Never rendered. A reader gets the localised sentence for `reason`; this
     * exists because "the clip could not be cleaned" is unactionable in a bug
     * report, and swallowing the engine's own words once already cost a
     * debugging round trip.
     */
    readonly detail?: string;
};

/** What the browser knows about the chosen clip once its container has been read. */
export type SourceVideoFacts = {
    readonly name: string;
    /** MIME type as the browser reported it, lower-cased. */
    readonly type: string;
    readonly bytes: number;
    /** Display dimensions, after the container's own rotation has been applied. */
    readonly width: number;
    readonly height: number;
    readonly durationSeconds: number;
    readonly frameRate: number;
};

export type VideoProbeResult =
    { readonly ok: true; readonly facts: SourceVideoFacts } | VideoFailure;

/**
 * Where a run has got to. Four named stages rather than one number, because they
 * take visibly different amounts of time and a bar that stalls at 12% for eight
 * seconds reads as broken when it is only reading the file.
 */
export const VIDEO_CLEAN_STAGES = ["reading", "detecting", "cleaning", "finalizing"] as const;

export type VideoCleanStage = (typeof VIDEO_CLEAN_STAGES)[number];

export type VideoCleanProgress = {
    readonly stage: VideoCleanStage;
    /** 0–1 through the current stage. */
    readonly ratio: number;
};

/** The finished clip, and what was actually done to it. */
export type CleanedVideo = {
    readonly blob: Blob;
    readonly width: number;
    readonly height: number;
    readonly durationSeconds: number;
    /** The rectangle that was repainted, in source pixels. */
    readonly repainted: PixelBox;
    /** Share of the search box the mark turned out to occupy. */
    readonly coverage: number;
    /** False when the source had audio that this container could not carry. */
    readonly audioKept: boolean;
};

export type VideoCleanResult = { readonly ok: true; readonly video: CleanedVideo } | VideoFailure;
