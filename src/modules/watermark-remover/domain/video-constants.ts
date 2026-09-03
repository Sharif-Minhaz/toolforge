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
 * gets repainted is the mark found inside this square, not the square, so a box
 * that is too big costs a little search time, while a box that is too small
 * clips the mark and leaves the clipped part in the finished clip — which looks
 * like the tool half worked, and is the more expensive mistake by far.
 */
export const DEFAULT_BOX_SIDE_RATIO = 0.3;

/**
 * Where the mark's centre actually sits, as a share of the frame's shorter side
 * in from each edge.
 *
 * Measured, not assumed. On a 720x1280 Gemini clip the sparkle centres on
 * (600, 1157) — 120 px from the right edge and 123 px from the bottom, both
 * 0.17 of the 720-pixel short side. On a 1024x576 one it centres on (929, 476):
 * 95 px and 100 px, against a 576-pixel short side. The same ratio twice, which
 * is what a mark laid on by a renderer at a fixed proportional inset looks like.
 *
 * The first version anchored the box flush into the corner instead, which put
 * the mark against the box's inner wall with its glow clipped and dragged in a
 * strip of whatever else lives along the frame's edge.
 */
export const WATERMARK_INSET_RATIO = 0.17;

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
 * How far a mark can reach past its own core, as a multiple of the core's
 * radius — the single number the second pass is bounded by.
 *
 * This replaced a dilation measured in shares of the *box*, and the difference
 * is the whole defect. A glow belongs to the glyph casting it and scales with
 * it, so a fixed share of a box the reader can resize is measuring the wrong
 * thing twice over: too small, and the background estimate is interpolated
 * across a hole whose border still sits inside the halo — the halo measures as
 * background, the opacity comes out low, the mask stops early, and the ring left
 * behind is exactly what a reader calls "the watermark is still there". Too
 * large, and the disc swallows scenery the mark never touched.
 *
 * Measured on a synthetic sparkle whose glow is known by construction: at 0.14
 * of the box the estimate missed 1,925 pixels of real mark and left 20 levels of
 * residue over the glow; bounded by the core at this multiple instead, it misses
 * none and leaves 2.6.
 */
export const MARK_REACH_RATIO = 2.4;

/** The first pass only has to find the core reliably; the second finds the rest. */
export const DETECT_ROUGH_GLOW_RATIO = 0.04;

/**
 * How faint a connected pixel may be and still count as the mark's own glow.
 *
 * Low on purpose, and safe to be low only because the growth is bounded twice
 * over — to the reach disc, and to what is connected to the core the first pass
 * committed to. Raising it to 0.06 to hold scenery back was treating the symptom
 * at the cost of the thing being measured: it cut the mask off at four fifths of
 * the mark's radius and left a visible ring. Measured, moving it back down here
 * takes the residue over the glow from 6.2 levels to 2.6.
 */
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
 * The most of the search box the mark's **core** is allowed to span, per axis.
 *
 * A watermark is a compact object inside the area it is looked for. Something
 * reaching most of the way across the box is a caption, a card edge, or a
 * pattern in the artwork — and repainting one of those is worse than admitting
 * the mark was not found.
 *
 * Applied to the core the first pass finds, never to the glow the second pass
 * grows. Applied to the grown mask it punished the detector for working: a
 * sparkle whose halo genuinely reaches most of the way across a snug box was
 * refused outright with `mark_not_found`, which is the one failure a reader
 * cannot do anything about.
 */
export const MAX_COMPONENT_SPAN_RATIO = 0.75;

/**
 * The most of the search box that may be cut out of the background estimate
 * before the estimate has nothing left to read from.
 *
 * Past this the box is mostly bright standing content, which is a corner this
 * tool cannot say anything useful about; it falls back to interpolating across
 * the mark's reach alone and takes its chances on the rim.
 */
export const MAX_BACKGROUND_HOLE_COVERAGE = 0.6;

/**
 * How thin a bright structure has to be before it is discounted, as a share of
 * the box's shorter side.
 *
 * Picking the blob nearest the middle is not enough on its own, because the
 * scenery *touches* the mark. A honeycomb pattern laid over the artwork runs a
 * lit edge straight through the sparkle; a caption's underline reaches it. Once
 * they are connected they are one blob, and the flood escapes along them — on a
 * real clip the mark came back 55x68 inside a 108-pixel box, most of which was
 * hexagon edge, and every pixel of it got white subtracted from it.
 *
 * What separates them is thickness, not brightness. A mark is a solid glyph tens
 * of pixels across; the things that touch it are lines a few pixels wide. Eroding
 * by this much parts every join, and dilating back afterwards returns the mark to
 * its own size with the lines gone.
 */
export const DETECT_EROSION_RATIO = 0.04;

/** Below two pixels an erosion cannot part anything a decoder's edges would join. */
export const MIN_EROSION_PX = 2;

/**
 * Where the escalating erosion gives up, as a share of the box's shorter side.
 *
 * Past this the structuring element is a fair fraction of the mark itself, so a
 * box that still holds nothing compact in the middle holds no mark — and saying
 * so is better than opening until something, anything, survives.
 */
export const DETECT_MAX_EROSION_RATIO = 0.12;

/**
 * How thin a structure has to be to be parted from the mark in the second pass,
 * as a share of the mark's reach rather than of the box.
 *
 * Same correction as `MARK_REACH_RATIO`, for the same reason. The things that
 * touch a mark — a caption's bar, a card's lit edge, a seam in the artwork — are
 * thin *relative to the mark*, which is what makes thickness a usable test at
 * all. Measured against a box the reader can resize, the same clip is opened by
 * a different amount depending on how big a square was drawn around it, and on a
 * corner with a caption running under the sparkle that difference is between
 * repainting the caption and not.
 */
export const MARK_OPENING_RATIO = 0.15;

/** No mark is smaller than this, so no first guess at its reach is either. */
export const MIN_REACH_PX = 12;

/**
 * How much the reach grows each time the mark turns out to fill it, and how many
 * times that is allowed to happen.
 *
 * Half again per step, four steps: enough to get from a core badly
 * under-measured by a bright neighbour to five times that radius, and few enough
 * that the whole search is five harmonic fills over one averaged corner, once,
 * before the per-frame loop starts.
 */
export const REACH_GROWTH = 1.5;
export const MAX_REACH_STEPS = 4;

/** How wide a band counts as the disc's rim when asking whether the mark ran into it. */
export const REACH_RIM_PX = 2;

/** How wide a band outside the disc is probed for the mark still reaching past it. */
export const REACH_PROBE_PX = 8;

/**
 * How far below the fitted surface that band has to sit, in 0–255 levels, to
 * count as the mark's dark half rather than as the surface being imperfect.
 *
 * Above the background model's own error, which on a structured corner is about
 * four levels at the ninetieth percentile and under one on a smooth one. Set
 * lower, the disc grows on the model's noise until the fit has no picture left
 * to read and the mark is lost outright — measured, at 1.0 one of the two real
 * clips stopped being detected at all.
 *
 * The reason a couple of levels is worth chasing at all is the divisor
 * everything here passes through: `Δa = ΔB / (255 − B)`. Over a dark corner ten
 * levels of background error is a hundredth of opacity and invisible; over a
 * corner going white it is a tenth, and a tenth of white subtracted from a pixel
 * that never had it is a patch a reader can point at. A rim left sitting inside
 * the mark biases `B` for the whole disc.
 */
export const REACH_PROBE_DEFICIT = 2.5;

/**
 * The offset the background residual is carried at while it goes through the
 * fill, which works in bytes.
 *
 * A residual is signed and small; a byte is neither. Mid-grey is subtracted
 * again on the way out, so the only cost is a level of rounding on a quantity
 * that is already a correction.
 */
export const RESIDUAL_BIAS = 128;

/**
 * Where the reach stops growing, as a share of the box's shorter side.
 *
 * The disc has to leave a border of picture inside the box, because that border
 * is what the background estimate is read from. A mark that still fills a disc
 * this size is either not a mark or is not going to be removed cleanly, and
 * either way growing further would only mean interpolating the whole box out of
 * its own edges.
 */
export const MAX_REACH_RATIO = 0.42;

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
 * How deep a dark ring around the mark may be taken to be the mark's own, in
 * 0–255 levels, and how shallow before it is left alone.
 *
 * The ceiling is a guard rather than a threshold: the halo measures four to
 * seven levels on real clips, so anything far past that is a background
 * estimate having gone wrong rather than a watermark, and subtracting it would
 * paint a bright ring into the picture. The floor is where a ring stops being
 * visible, and is deliberately below where it stops being certain — the same
 * argument as `ALPHA_FLOOR`, for the same reason.
 */
export const HALO_MAX_LEVELS = 20;

/**
 * How finely the dark ring's radial profile is sampled, and how many pixels a
 * ring needs before its average is worth anything.
 */
/**
 * How far the smooth background surface may sit from the picture, in 0–255
 * levels RMS, before the mark's dark half stops being measurable at all.
 *
 * Swept on both real clips: one has a smooth corner the surface tracks closely
 * and gains from the correction, the other a patterned one it does not, where
 * the same correction subtracts the surface's own error and makes things worse.
 */
export const HALO_MAX_MODEL_MISS = 6;

export const HALO_RINGS = 48;
export const HALO_MIN_RING_PIXELS = 40;

/**
 * How far the dark-half correction is faded out at the two edges it can run
 * into: the outermost rings of its own disc, and the wall of the search box.
 *
 * The second is the one that bites. The box is square and the correction is not,
 * so a disc large enough to be clipped by it ends in a straight line — and a
 * hard rectangle painted across the frame is far more visible than the ring the
 * correction was removing.
 */
export const HALO_TAPER_RINGS = 6;
export const HALO_TAPER_PX = 10;
export const HALO_FLOOR_LEVELS = 0.6;

/**
 * Where un-blending stops being worth doing, and why it is nowhere near 1.
 *
 * `b = (o − a·255) / (1 − a)` divides by `1 − a`, so every error in the observed
 * pixel — and a compressed frame is *made* of small errors — comes out
 * multiplied by `1/(1 − a)`. At `a = 0.9` that is ten times. The opacity can be
 * perfect and the arithmetic exact, and the result is still ten times grainier
 * than the picture around it, in precisely the shape of the mark: not a stain,
 * but a patch of visible noise where a sparkle used to be.
 *
 * So the strongly covered part is rebuilt from its surroundings instead, where
 * "strongly" starts at half. Recovering real texture is better than inventing
 * smooth texture right up until the recovery is mostly amplified noise, and past
 * a half the amplification is already doubling.
 */
export const ALPHA_INPAINT_START = 0.5;

/**
 * …and where it is rebuilt outright. Between the two the two answers are
 * cross-faded, because a hard line between recovered and invented pixels is
 * itself an edge, drawn along a contour of the mark — which is the artefact all
 * over again in a different colour.
 */
export const ALPHA_INPAINT_FULL = 0.75;

/**
 * How wide a band along the mark's own outline is rebuilt outright, as a share
 * of the box's shorter side.
 *
 * A mark has a hard edge, and a codec cannot encode a hard edge exactly — it
 * rings. Measured on a real clip, the two pixels along the sparkle's rim carried
 * seven to ten levels that the averaged frames simply do not contain, because
 * the ringing belongs to *this* frame's encoding rather than to the mark. No
 * per-pixel opacity, however well estimated, can subtract something that is not
 * in the model, so an un-blend leaves the outline standing while the middle
 * comes out clean — a dark tracing of the mark, which is what a reader sees and
 * calls a defect.
 *
 * The band is one or two pixels wide, which is exactly the size of hole a fill
 * from the surrounding picture closes invisibly.
 */
export const REBUILD_RIM_RATIO = 0.02;

/** Below two pixels a rim is narrower than the ringing it exists to cover. */
export const MIN_RIM_PX = 2;

/**
 * How much the opacity has to change between neighbouring pixels for one of them
 * to count as sitting on the mark's own outline.
 *
 * A glow drifts by a hundredth of a point per pixel; a glyph's edge goes from
 * covered to clear inside two. Only the second is a place where the frame
 * carries something the averaged frames do not — the codec's ringing, and a
 * chroma sample averaged across a boundary that is half mark and half footage.
 */
export const ALPHA_EDGE_STEP = 0.15;

/** How wide a band around that outline is rebuilt, as a share of the box's shorter side. */
export const REBUILD_EDGE_RATIO = 0.015;

/**
 * How far the rebuild weight is feathered **in space**, as a share of the box's
 * shorter side.
 *
 * The cross-fade between recovered and invented pixels is written in opacity,
 * and on a mark with a hard edge the opacity crosses the whole ramp inside one
 * pixel — so the fade degenerates into a switch and draws a line along the
 * mark's contour, which is the artefact the ramp existed to prevent. Feathering
 * the weight map itself makes the transition a fixed number of pixels wide
 * however fast the opacity moves.
 */
export const REBUILD_FEATHER_RATIO = 0.02;

/** Below this share the rebuild contributes nothing a byte can hold, so it is dropped. */
export const REBUILD_WEIGHT_FLOOR = 0.02;

/**
 * The ceiling on the opacity the division is ever handed, whatever was
 * estimated. Ten-times amplification is out of the question; four is the most a
 * pixel that is going to be cross-faded away anyway needs to contribute.
 */
export const ALPHA_UNBLEND_MAX = 0.75;

/**
 * Where the rebuild's hole ends — not where the rebuild does.
 *
 * The two are different questions and were the same number for one round too
 * many. How much of a pixel to invent is a question about noise gain, and the
 * answer is a ramp around half covered. Where the fill may *read from* is a
 * question about how trustworthy the un-blend is at the border, and `1 / (1 − a)`
 * says that is only true where `a` is small. See `rebuildHoles`.
 */
export const FILL_BORDER_ALPHA = 0.1;

/**
 * How much headroom a channel needs between the background and white before it
 * is allowed into the opacity estimate at all.
 *
 * A backstop rather than the main defence. The estimate is a headroom-weighted
 * fit across the three channels, so a channel with almost none is already worth
 * almost nothing to it; this only keeps a channel whose headroom is pure noise
 * out of the arithmetic entirely.
 */
export const MIN_ALPHA_HEADROOM = 12;

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
 * Over-relaxation factor for the smoothing sweeps.
 *
 * Plain neighbour averaging converges on a hole's true surface in about the
 * square of its width — a hundred-pixel hole wants ten thousand sweeps, and
 * anything less leaves the middle sagging toward the average of its rim. On a
 * corner with a gradient across it that sag is a background estimate that is too
 * dark, an opacity that is therefore too high, and a mark-shaped patch subtracted
 * out of a frame that never had that much white in it.
 *
 * Overshooting each correction — moving past the neighbour average rather than
 * onto it — converges in about the width instead of its square. Anything at or
 * above 2 diverges.
 */
export const INPAINT_OVER_RELAXATION = 1.9;

/**
 * How little a sweep has to move the patch before the sweeps stop, in 0–255
 * levels.
 *
 * A quarter of a level cannot be seen and cannot survive the rounding to a byte,
 * so a sweep that moves nothing by more than this has finished — whatever the
 * iteration budget still says. The budget is sized for the worst hole this tool
 * can be handed; most frames are nowhere near it, and the difference is paid on
 * every frame of the clip.
 */
export const INPAINT_SETTLED = 0.25;

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

/**
 * Audio codecs the result is written with, best first.
 *
 * AAC leads because an MP4 holding it plays everywhere a phone, a desktop player
 * or a social upload will take it. Opus in an MP4 is legal and smaller, and
 * QuickTime and Safari will not play it — which for a tool whose whole promise is
 * a clip you can post is the wrong trade at any bitrate.
 *
 * The choice is needed at all because the audio usually cannot simply be copied:
 * AAC in an MP4 carries encoder priming, so its first sample sits fractionally
 * before zero, and a muxer that must trim to zero has to re-encode to do it.
 */
export const AUDIO_ENCODE_CODECS = ["aac", "opus"] as const;

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
