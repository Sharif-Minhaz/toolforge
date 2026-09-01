/**
 * Formats the video half accepts. Narrower than what a `<video>` element will
 * play: every one of these has to survive a full decode-repaint-encode round
 * trip in the browser, and the muxer on the way out only writes MP4.
 */
export const ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
] as const;

export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

/** `accept` for the file input — a hint to the picker, never a substitute for the check. */
export const VIDEO_ACCEPT_ATTRIBUTE = [
    ...ALLOWED_VIDEO_TYPES,
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
].join(",");

/**
 * Ceiling on the file. Nothing is uploaded, so this is not a bandwidth budget —
 * it is the point past which the finished file, which is assembled in memory
 * before it is handed over, stops being something a browser tab can hold.
 */
export const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

/**
 * Ceiling on the clip. A Gemini or Veo generation is eight seconds, and the
 * longest anything that tool produces runs to is under a minute; past that the
 * frame-by-frame pass stops being a wait and becomes an abandonment.
 */
export const MAX_VIDEO_SECONDS = 60;

/**
 * The square the detector looks inside, as a share of the frame's *shorter*
 * side, anchored flush to the bottom-right corner.
 *
 * Gemini and Veo put their sparkle there at a size that scales with the frame,
 * so one ratio covers 720p and 4K alike. Deliberately generous: what actually
 * gets repainted is the glyph found inside this square, not the square, so a
 * box that is too big costs a little search time and a box that is too small
 * loses half the logo.
 */
export const DEFAULT_BOX_SIDE_RATIO = 0.2;

/** Below this the box is too small to hold both a logo and the context to rebuild from. */
export const MIN_BOX_SIDE_RATIO = 0.04;

/** A box larger than this is no longer a corner mark; it is most of the picture. */
export const MAX_BOX_SIDE_RATIO = 0.6;

/** One arrow-key nudge of the box, as a share of the frame. */
export const BOX_NUDGE_RATIO = 0.005;

/** Held `Shift` covers this many nudges at once. */
export const BOX_NUDGE_MULTIPLIER = 5;

/**
 * How many frames the detector averages before it decides what the watermark is.
 *
 * The logo is the one thing in the corner that does not move, so averaging over
 * frames spread across the whole clip flattens the footage behind it and leaves
 * the glyph standing. Too few samples and a static background survives the
 * average and gets mistaken for a logo.
 */
export const DETECT_SAMPLE_COUNT = 24;

/**
 * Radius of the small blur that denoises the averaged corner, in pixels. One
 * pixel: enough to kill encoder noise, small enough to leave a thin stroke.
 */
export const DETECT_SMOOTH_RADIUS = 1;

/**
 * Radius of the large blur that estimates what is *behind* the logo, as a share
 * of the box's shorter side. The difference between the two blurs is the
 * band-pass that the glyph shows up in, so this has to be several times a
 * stroke's width and still well inside the box.
 */
export const DETECT_BACKGROUND_RADIUS_RATIO = 0.25;

/**
 * How far above its own surroundings a pixel has to sit, in 0–255 luma, before
 * the brightest thing in the box counts as a mark at all. Under this the corner
 * is flat and there is nothing to remove.
 */
export const DETECT_MIN_PEAK = 5;

/**
 * The mark is found with two thresholds, not one, and the second is the reason
 * the first version of this left a halo behind.
 *
 * A sparkle is a bright core inside a wide, faint glow. Thresholding once at a
 * third of the peak finds the core and stops; the glow — which is most of what
 * the eye actually sees — falls under the line and survives, and a fill that
 * reads its answer off pixels that still carry the glow inherits it.
 *
 * So: seed at `DETECT_PEAK_RATIO` of the peak, then grow through every connected
 * pixel still above `DETECT_GLOW_RATIO`. Anything the mark touches at all is
 * part of the mark.
 */
export const DETECT_PEAK_RATIO = 0.32;

/** …and never on less than this much absolute lift, however dim the peak was. */
export const DETECT_MIN_DELTA = 3;

/**
 * How far the first pass grows its rough mask before the background under the
 * mark is rebuilt, as a share of the box's shorter side.
 *
 * Deliberately far more than the final dilation. This mask is not what gets
 * repainted — it is the hole the background estimate is interpolated across, and
 * its *border* is where that estimate reads its values from. A border still
 * standing inside the glow would put the glow into the background, which is the
 * error the second pass exists to avoid.
 */
export const DETECT_ROUGH_DILATION_RATIO = 0.14;

/** The first pass only has to find the core reliably; the second finds the rest. */
export const DETECT_ROUGH_GLOW_RATIO = 0.04;

/** How faint a connected pixel may be and still count as the mark's own glow. */
export const DETECT_GLOW_RATIO = 0.015;

/** The noise floor the glow threshold never drops under, in 0–255 luma. */
export const DETECT_MIN_GLOW_DELTA = 1;

/**
 * How far the found glyph is grown, as a share of the box's shorter side. A
 * watermark's anti-aliased fringe sits just outside the shape a threshold
 * finds, and a fringe left behind reads as a failed removal.
 */
export const DETECT_DILATION_RATIO = 0.03;

/** Below a couple of pixels a dilation stops being a margin. */
export const MIN_DILATION_PX = 2;

/**
 * Coverage bounds on what the detector is allowed to call a watermark. Under
 * the floor it found noise; over the ceiling the box is sitting on a bright
 * object rather than a logo, and repainting half a frame is not a removal.
 */
export const MIN_MARK_COVERAGE = 0.0004;
export const MAX_MARK_COVERAGE = 0.5;

/**
 * The colour Gemini and Veo sign in.
 *
 * White, assumed rather than measured. Both marks are drawn white at partial
 * opacity, and taking the colour from the footage instead would mean estimating
 * two unknowns per pixel from one equation. If a future mark is not white, this
 * is the constant that is wrong.
 */
export const WATERMARK_COLOR = 255;

/**
 * Under this much opacity a pixel is left exactly as it was shot.
 *
 * Set where the correction stops being visible rather than where it stops being
 * confident, and those are very different numbers. At a mid-tone background,
 * one opacity point is about 1.5 levels out of 255 — so a floor of a few
 * hundredths, which sounds cautious, is a four-to-seven-level ring of leftover
 * glow drawn exactly around the mark. That ring *is* the halo. The estimate is
 * good to well under a hundredth, so the honest floor is the one below which
 * neither the residue nor the over-correction can be seen.
 */
export const ALPHA_FLOOR = 0.006;

/**
 * At or above this the mark is treated as solid: `(o − aW)/(1 − a)` divides by
 * almost nothing there, so a hundredth of an error in `a` becomes a wild colour.
 * Those pixels are rebuilt from their surroundings instead.
 */
export const ALPHA_OPAQUE_LIMIT = 0.9;

/**
 * How much headroom a channel needs between the background and white before its
 * opacity estimate is worth anything. Over a blown-out sky the denominator goes
 * to zero and the channel says nothing; the others still do.
 */
export const MIN_ALPHA_HEADROOM = 8;

/**
 * How much untouched picture is kept around the mark when the per-frame work
 * area is cut down to it. The fill reads its answer off this border, so it is
 * boundary data rather than padding.
 */
export const INPAINT_MARGIN_PX = 8;

/**
 * Passes of the harmonic relaxation that follows the first fill. The fill alone
 * leaves faint banding along the layers it grew in; the relaxation is what turns
 * it into the smooth surface a missing patch of sky or skin actually has.
 */
export const INPAINT_RELAX_ITERATIONS = 48;

/**
 * Sweeps per pixel of the hole's longer side, when the caller sizes the
 * relaxation to the hole rather than taking the default.
 *
 * The default is tuned for the solid core of a sparkle, which is a handful of
 * pixels across and settles almost immediately. The background estimate is a
 * different problem: it interpolates across the *whole* mark, glow included, and
 * a neighbour-averaging sweep moves information one pixel per pass — so a
 * fifty-pixel hole given fifty sweeps has barely heard from its own far side,
 * and the estimate comes out closer to the first fill than to the answer. An
 * opacity read off that estimate is wrong by however far it did not converge.
 */
export const INPAINT_RELAX_PER_PIXEL = 4;

/** Past this the sweeps stop buying accuracy worth the wait. */
export const MAX_INPAINT_RELAX_ITERATIONS = 1200;

/**
 * Codecs the encoder is offered, best first. H.264 leads because an MP4 holding
 * it plays everywhere a phone or a social upload will take it; the other two are
 * there for a browser that cannot encode H.264 at all.
 */
export const VIDEO_ENCODE_CODECS = ["avc", "vp9", "av1"] as const;

/** Seconds between key frames in the result. Two is the muxer's own default. */
export const OUTPUT_KEY_FRAME_INTERVAL = 2;

/** The only container written on the way out. */
export const OUTPUT_VIDEO_TYPE = "video/mp4";

/**
 * How much of an engine's own error message is kept for the log. Enough to
 * carry a codec's complaint, short of a whole stack trace.
 */
export const MAX_FAILURE_DETAIL_LENGTH = 300;

/**
 * The colours the search box is drawn in.
 *
 * Literals rather than design tokens, and allowed to be for the same reason
 * `MASK_PAINT_COLOR` is: they sit over the reader's own footage rather than over
 * a themed surface, so they have to hold up against arbitrary pixels instead of
 * matching either palette.
 */
export const BOX_OUTLINE_COLOR = "rgba(255, 62, 116, 0.95)";
export const BOX_FILL_COLOR = "rgba(255, 62, 116, 0.12)";
export const BOX_HANDLE_COLOR = "rgba(255, 255, 255, 0.95)";
export const BOX_HANDLE_RING_COLOR = "rgba(0, 0, 0, 0.55)";
