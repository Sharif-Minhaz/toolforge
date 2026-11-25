import type { PixelBox, WatermarkDetection, WatermarkProfile } from "../types";
import {
    boxBlur,
    countMask,
    cropMask,
    dilateMask,
    erodeMask,
    lumaOf,
    maskBounds,
} from "./glyph-mask";
import { inpaintRegion, relaxationPassesFor } from "./inpaint";
import { expandPixelBox } from "./watermark-box";
import {
    INPAINT_MARGIN_PX,
    LONE_MARK_CENTRE_RATIO,
    MIN_ALPHA_HEADROOM,
    WATERMARK_COLOR,
    WORDMARK_CHROMA_BLUR_PX,
    WORDMARK_CORE_EROSION_PX,
    WORDMARK_FRINGE_RATIO,
    WORDMARK_LEVELS,
    WORDMARK_LINK_GAP_RATIO,
    WORDMARK_LINK_LIFT_RATIO,
    WORDMARK_MAX_SLOPE,
    WORDMARK_MIN_ASPECT,
    WORDMARK_MIN_COLOR_SPREAD,
    WORDMARK_MIN_FLATNESS,
    WORDMARK_MIN_FRINGE_PX,
    WORDMARK_MIN_GLYPHS,
    WORDMARK_MIN_GLYPH_PIXELS,
    WORDMARK_MIN_STAND,
    WORDMARK_OPENING_RATIOS,
} from "./video-constants";

/** A mark made of several separate shapes: a logo, a name, or a logo and a name. */
export type Wordmark = {
    /** `1` on every glyph's own pixels, in the search box's coordinates. */
    readonly glyphs: Uint8Array;
    readonly bounds: PixelBox;
    /** How far the typical glyph pixel stands above its surroundings, in luma. */
    readonly lift: number;
};

type Glyph = {
    readonly pixels: readonly number[];
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly lift: number;
};

/**
 * A running minimum or maximum along one axis, window `2 * radius + 1`, clamped
 * at the edges. A monotonic queue, so its cost does not grow with the radius —
 * which it would otherwise do painfully, because the radius is a share of a box
 * that can be most of a 4K frame.
 */
function extremeAxis(
    values: Float32Array,
    width: number,
    height: number,
    radius: number,
    horizontal: boolean,
    sign: 1 | -1,
): Float32Array {
    const target = new Float32Array(values.length);
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    const step = horizontal ? 1 : width;
    const queue = new Int32Array(inner);

    for (let line = 0; line < outer; line += 1) {
        const start = horizontal ? line * width : line;
        const at = (position: number): number => sign * (values[start + position * step] ?? 0);
        let head = 0;
        let tail = 0;

        for (let position = 0; position < inner + radius; position += 1) {
            if (position < inner) {
                while (tail > head && at(queue[tail - 1] ?? 0) <= at(position)) {
                    tail -= 1;
                }

                queue[tail] = position;
                tail += 1;
            }

            const centre = position - radius;

            if (centre < 0) {
                continue;
            }

            while ((queue[head] ?? 0) < centre - radius) {
                head += 1;
            }

            target[start + centre * step] = sign * at(queue[head] ?? 0);
        }
    }

    return target;
}

function extreme(
    values: Float32Array,
    width: number,
    height: number,
    radius: number,
    sign: 1 | -1,
): Float32Array {
    return extremeAxis(
        extremeAxis(values, width, height, radius, true, sign),
        width,
        height,
        radius,
        false,
        sign,
    );
}

/**
 * How far each pixel stands above whatever is wider than the window — a white
 * top-hat: the picture minus its own morphological opening.
 *
 * A blur cannot do this job. It averages the glyphs into the background they are
 * measured against, so a letter beside a letter measures fainter than a letter on
 * its own. An opening takes the minimum, so a solid glyph comes out standing at
 * its full height however many neighbours it has — a plateau, which is the one
 * thing scenery is not.
 */
export function topHat(
    values: Float32Array,
    width: number,
    height: number,
    radius: number,
): Float32Array {
    const opened = extreme(extreme(values, width, height, radius, -1), width, height, radius, 1);

    return Float32Array.from(values, (value, index) => value - (opened[index] ?? 0));
}

/** The value a given share of the way up a sorted list. */
function quantile(sorted: Float32Array, share: number): number {
    return sorted[Math.floor(share * (sorted.length - 1))] ?? 0;
}

/**
 * Every connected blob above `level` that stands up like a glyph: big enough, a
 * plateau rather than a slope, and lifted well clear of the threshold.
 *
 * Blobs touching the wall of the box are kept in the list. They cannot be part of
 * a mark that is inside the box, but a row that runs into one is a row that
 * carries on outside it — a caption — and the linking step needs to see that.
 */
function glyphsAbove(
    lift: Float32Array,
    width: number,
    height: number,
    level: number,
): readonly Glyph[] {
    const seen = new Uint8Array(lift.length);
    const glyphs: Glyph[] = [];

    for (let seed = 0; seed < lift.length; seed += 1) {
        if (seen[seed] === 1 || (lift[seed] ?? 0) < level) {
            continue;
        }

        const pixels: number[] = [seed];
        let left = width;
        let top = height;
        let right = -1;
        let bottom = -1;

        seen[seed] = 1;

        for (let head = 0; head < pixels.length; head += 1) {
            const index = pixels[head] ?? 0;
            const x = index % width;
            const y = (index - x) / width;

            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);

            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;

                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                        continue;
                    }

                    const neighbour = ny * width + nx;

                    if (seen[neighbour] === 1 || (lift[neighbour] ?? 0) < level) {
                        continue;
                    }

                    seen[neighbour] = 1;
                    pixels.push(neighbour);
                }
            }
        }

        if (pixels.length < WORDMARK_MIN_GLYPH_PIXELS) {
            continue;
        }

        const sorted = Float32Array.from(pixels, (index) => lift[index] ?? 0).sort();
        const median = quantile(sorted, 0.5);
        const peak = quantile(sorted, 0.9);

        if (peak < level * WORDMARK_MIN_STAND || median < peak * WORDMARK_MIN_FLATNESS) {
            continue;
        }

        glyphs.push({ pixels, left, top, right, bottom, lift: median });
    }

    return glyphs;
}

/** Whether two glyphs are close enough, and alike enough, to be one mark. */
function belongTogether(one: Glyph, other: Glyph): boolean {
    const reach =
        Math.max(one.bottom - one.top, other.bottom - other.top) * WORDMARK_LINK_GAP_RATIO;
    const gapX = Math.max(one.left, other.left) - Math.min(one.right, other.right);
    const gapY = Math.max(one.top, other.top) - Math.min(one.bottom, other.bottom);

    return (
        gapX <= reach &&
        gapY <= reach &&
        Math.min(one.lift, other.lift) >= Math.max(one.lift, other.lift) * WORDMARK_LINK_LIFT_RATIO
    );
}

/** Splits the glyphs into the groups `belongTogether` joins. */
function linkGlyphs(glyphs: readonly Glyph[]): readonly (readonly Glyph[])[] {
    const pending = new Set(glyphs);
    const groups: Glyph[][] = [];

    for (const first of glyphs) {
        if (!pending.delete(first)) {
            continue;
        }

        const group = [first];

        for (let head = 0; head < group.length; head += 1) {
            const member = group[head];

            for (const candidate of pending) {
                if (member !== undefined && belongTogether(member, candidate)) {
                    pending.delete(candidate);
                    group.push(candidate);
                }
            }
        }

        groups.push(group);
    }

    return groups;
}

function boundsOf(group: readonly Glyph[]) {
    return {
        left: Math.min(...group.map((glyph) => glyph.left)),
        top: Math.min(...group.map((glyph) => glyph.top)),
        right: Math.max(...group.map((glyph) => glyph.right)),
        bottom: Math.max(...group.map((glyph) => glyph.bottom)),
    };
}

/** How much mark a group shows: how many pixels of it, standing how tall. */
function weightOf(group: readonly Glyph[]): number {
    return group.reduce((total, glyph) => total + glyph.pixels.length * glyph.lift, 0);
}

/**
 * Whether a group of plateaus is laid out like a mark: several of them, wider
 * together than they are tall, and all of them inside the box.
 *
 * Running into the wall of the box means running out of it — a caption, or a mark
 * the box does not hold. Neither can be taken out whole.
 */
function isRow(group: readonly Glyph[], width: number, height: number): boolean {
    if (group.length < WORDMARK_MIN_GLYPHS) {
        return false;
    }

    const { left, top, right, bottom } = boundsOf(group);

    return (
        left > 0 &&
        top > 0 &&
        right < width - 1 &&
        bottom < height - 1 &&
        right - left + 1 >= (bottom - top + 1) * WORDMARK_MIN_ASPECT
    );
}

function toWordmark(group: readonly Glyph[], width: number, height: number): Wordmark | null {
    const glyphs = new Uint8Array(width * height);

    for (const glyph of group) {
        for (const index of glyph.pixels) {
            glyphs[index] = 1;
        }
    }

    const bounds = maskBounds(glyphs, width, height);
    const lifts = Float32Array.from(group, (glyph) => glyph.lift).sort();

    return bounds === null ? null : { glyphs, bounds, lift: quantile(lifts, 0.5) };
}

/**
 * The standing lift of one corner, one frame at a time.
 *
 * Kept per frame and combined by **median** rather than averaged. The lift of the
 * average is the lift of everything that was ever there; the median of the lifts
 * is what stood there most of the time, which drops a streak of light that
 * crossed the corner for half a second and keeps a mark that a flash washed out
 * for as long. Held as bytes, because there are two dozen of them.
 */
export type LiftSamples = {
    readonly width: number;
    readonly height: number;
    readonly radii: readonly number[];
    /** One list of frames per radius. */
    readonly lifts: Uint8ClampedArray[][];
};

export function createLiftSamples(width: number, height: number): LiftSamples {
    const radii = WORDMARK_OPENING_RATIOS.map((ratio) =>
        Math.max(2, Math.round(Math.min(width, height) * ratio)),
    );

    return { width, height, radii, lifts: radii.map(() => []) };
}

/** Folds one frame's crop, as RGBA, into the samples. */
export function addLiftSample(samples: LiftSamples, rgba: Uint8ClampedArray): void {
    const { width, height } = samples;
    const luma = new Float32Array(width * height);

    for (let index = 0; index < luma.length; index += 1) {
        const offset = index * 4;

        luma[index] = lumaOf(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0);
    }

    samples.radii.forEach((radius, at) => {
        samples.lifts[at]?.push(Uint8ClampedArray.from(topHat(luma, width, height, radius)));
    });
}

function medianLift(frames: readonly Uint8ClampedArray[], length: number): Float32Array {
    const lift = new Float32Array(length);
    const column = new Uint8Array(frames.length);

    for (let index = 0; index < length; index += 1) {
        for (let frame = 0; frame < frames.length; frame += 1) {
            column[frame] = frames[frame]?.[index] ?? 0;
        }

        column.sort();
        lift[index] = column[Math.floor((column.length - 1) / 2)] ?? 0;
    }

    return lift;
}

/**
 * Finds a mark made of several shapes — a logo and a name — standing in a corner,
 * or `null` when there is no such thing in it.
 *
 * The sparkle's detector cannot: it commits to the one blob nearest the middle of
 * the box and bounds everything after that by a disc around it, so a wordmark
 * loses a letter and keeps the rest.
 *
 * What separates a wordmark from scenery is not brightness, size or position. It
 * is that every piece of it was laid on at **one opacity**: each is a plateau, and
 * the plateaus are the same height.
 */
export function findWordmark(samples: LiftSamples): Wordmark | null {
    const { width, height } = samples;
    let best: readonly Glyph[] | null = null;
    let bestScore = 0;

    for (const frames of samples.lifts) {
        const lift = medianLift(frames, width * height);

        for (const level of WORDMARK_LEVELS) {
            for (const group of linkGlyphs(glyphsAbove(lift, width, height, level))) {
                const score = isRow(group, width, height) ? weightOf(group) : 0;

                if (score > bestScore) {
                    best = group;
                    bestScore = score;
                }
            }
        }
    }

    return best === null ? null : toWordmark(best, width, height);
}

/** One frame's crop around the mark: what is there, and what is behind it. */
type WordmarkSample = {
    readonly observed: Uint8ClampedArray;
    readonly under: Uint8ClampedArray;
};

/**
 * What a clip says about a wordmark's colour and opacity.
 *
 * Works in a window cut to the mark rather than in the search box, so the samples
 * it keeps are a couple of megabytes however large a box somebody drew.
 */
export type WordmarkFit = {
    readonly wordmark: Wordmark;
    /** The mark, its fringe and a border to interpolate from, in the box's coordinates. */
    readonly window: PixelBox;
    /** The glyphs and their fringe: what the background is interpolated across. */
    readonly touched: Uint8Array;
    /** Glyph pixels clear of the anti-aliased edge, where the opacity is one number. */
    readonly core: Uint8Array;
    readonly passes: number;
    readonly samples: WordmarkSample[];
};

export function createWordmarkFit(wordmark: Wordmark, width: number, height: number): WordmarkFit {
    const fringe = Math.max(
        WORDMARK_MIN_FRINGE_PX,
        Math.round(wordmark.bounds.height * WORDMARK_FRINGE_RATIO),
    );
    const window = expandPixelBox(wordmark.bounds, fringe + INPAINT_MARGIN_PX, { width, height });
    const glyphs = cropMask(wordmark.glyphs, width, height, window);
    const inner = erodeMask(glyphs, window.width, window.height, WORDMARK_CORE_EROSION_PX);

    return {
        wordmark,
        window,
        touched: dilateMask(glyphs, window.width, window.height, fringe),
        // Strokes thinner than the erosion leave nothing; the glyphs themselves
        // are then the best there is.
        core: countMask(inner) < WORDMARK_MIN_GLYPH_PIXELS ? glyphs : inner,
        passes: relaxationPassesFor(wordmark.bounds.height),
        samples: [],
    };
}

/** Folds one frame into the fit: the fit's own window of it, as RGBA. */
export function addWordmarkSample(fit: WordmarkFit, rgba: Uint8ClampedArray): void {
    const under = Uint8ClampedArray.from(rgba);

    inpaintRegion(under, fit.window.width, fit.window.height, fit.touched, fit.passes);
    fit.samples.push({ observed: Uint8ClampedArray.from(rgba), under });
}

/**
 * The grey the mark is drawn in.
 *
 * `o = (1 − a)·b + a·W` is a straight line in `b`, so a clip whose corner gets
 * lighter and darker draws that line: its slope is `1 − a` and its intercept is
 * `a·W`.
 *
 * A corner that holds still says nothing — a point is not a line. White is the
 * answer then, and it is a safe one: with a background that never moves, every
 * pair of colour and opacity that explains one frame undoes all of them alike.
 */
export function fitWordmarkColor(fit: WordmarkFit): number {
    const points = fit.samples.map((sample) => ({
        under: meanLuma(sample.under, fit.core),
        observed: meanLuma(sample.observed, fit.core),
    }));
    const under = points.reduce((total, point) => total + point.under, 0) / points.length;
    const observed = points.reduce((total, point) => total + point.observed, 0) / points.length;
    let covariance = 0;
    let variance = 0;

    for (const point of points) {
        covariance += (point.under - under) * (point.observed - observed);
        variance += (point.under - under) ** 2;
    }

    const spread = Math.sqrt(variance / points.length);
    const slope = covariance / variance;

    if (!(spread >= WORDMARK_MIN_COLOR_SPREAD) || slope < 0 || slope > WORDMARK_MAX_SLOPE) {
        return WATERMARK_COLOR;
    }

    return Math.min(WATERMARK_COLOR, Math.max(1, (observed - slope * under) / (1 - slope)));
}

/** The mean luma over the set pixels of a mask. */
function meanLuma(rgba: Uint8ClampedArray, mask: Uint8Array): number {
    let total = 0;
    let count = 0;

    for (let index = 0; index < mask.length; index += 1) {
        if (mask[index] === 1) {
            total += lumaAt(rgba, index);
            count += 1;
        }
    }

    return total / Math.max(1, count);
}

function lumaAt(rgba: Uint8ClampedArray, index: number): number {
    return lumaOf(rgba[index * 4] ?? 0, rgba[index * 4 + 1] ?? 0, rgba[index * 4 + 2] ?? 0);
}

/** One frame's answer about one pixel, and how much room it had to give one. */
type Vote = { readonly alpha: number; readonly room: number };

/**
 * The weighted median of the frames' answers, or `null` when none had room.
 *
 * The weight retires a frame whose background matches the mark; the median
 * retires a frame with something bright crossing the pixel, which a least-squares
 * fit would have believed.
 */
function elect(votes: Vote[]): number | null {
    const half = votes.reduce((total, vote) => total + vote.room, 0) / 2;
    let seen = 0;

    votes.sort((one, other) => one.alpha - other.alpha);

    for (const vote of votes) {
        seen += vote.room;

        if (seen >= half) {
            return Math.min(1, Math.max(0, vote.alpha));
        }
    }

    return null;
}

/** How strongly a mark of this grey covers one pixel's brightness. */
function lumaAlphaAt(samples: readonly WordmarkSample[], index: number, color: number): number {
    const votes: Vote[] = [];

    for (const sample of samples) {
        const under = lumaAt(sample.under, index);
        const room = color - under;

        if (Math.abs(room) >= MIN_ALPHA_HEADROOM) {
            votes.push({
                alpha: (lumaAt(sample.observed, index) - under) / room,
                room: room * room,
            });
        }
    }

    return elect(votes) ?? 0;
}

/**
 * How strongly the mark covers one pixel's **colour**, which is not the same
 * number.
 *
 * A clip stores colour at half the resolution of brightness, so along a stroke a
 * few pixels wide every colour sample is part mark and part footage, and the mark
 * takes less colour out than its opacity says. Measured on a real clip: 0.46 of
 * the brightness and 0.33 of the colour. Un-blending both by the first returns
 * the letters tinted.
 *
 * The mark is a neutral grey, so there is no colour of its own to solve for: what
 * is left of the footage's colour is `1 − a` of it.
 */
function chromaAlphaAt(samples: readonly WordmarkSample[], index: number): number | null {
    const votes: Vote[] = [];

    for (const sample of samples) {
        const underLuma = lumaAt(sample.under, index);
        const observedLuma = lumaAt(sample.observed, index);
        let lost = 0;
        let room = 0;

        for (const channel of [0, 2]) {
            const under = (sample.under[index * 4 + channel] ?? 0) - underLuma;
            const observed = (sample.observed[index * 4 + channel] ?? 0) - observedLuma;

            lost += (under - observed) * under;
            room += under * under;
        }

        if (room >= MIN_ALPHA_HEADROOM ** 2) {
            votes.push({ alpha: lost / room, room });
        }
    }

    return elect(votes);
}

/** Everything the repaint needs about the mark, in the search box's own coordinates. */
export function finishWordmarkFit(
    fit: WordmarkFit,
    width: number,
    height: number,
): WatermarkProfile {
    const { window } = fit;
    const color = fitWordmarkColor(fit);
    const measured = Float32Array.from(fit.touched, (value, index) =>
        value === 1 ? lumaAlphaAt(fit.samples, index, color) : 0,
    );

    // One mark is one opacity, so its middle is that number and nothing in it is
    // more opaque than its middle. What measures otherwise is codec noise or a
    // piece of scenery, and un-blending either one prints it into the picture.
    const solid = Float32Array.from(measured.filter((_, index) => fit.core[index] === 1)).sort();
    const opacity = quantile(solid, 0.5);
    const flat = Float32Array.from(measured, (value, index) =>
        fit.core[index] === 1 ? opacity : Math.min(opacity, value),
    );
    // Smoothed, where the opacity never is: this one is a measurement of something
    // half the resolution of the grid it is kept on.
    const tint = boxBlur(
        Float32Array.from(flat, (value, index) =>
            fit.touched[index] === 1
                ? Math.min(opacity, chromaAlphaAt(fit.samples, index) ?? value)
                : 0,
        ),
        window.width,
        window.height,
        WORDMARK_CHROMA_BLUR_PX,
    );

    const alpha = new Float32Array(width * height);
    const chroma = new Float32Array(width * height);
    const touched = new Uint8Array(width * height);

    for (let y = 0; y < window.height; y += 1) {
        for (let x = 0; x < window.width; x += 1) {
            const from = y * window.width + x;
            const to = (window.y + y) * width + window.x + x;

            alpha[to] = flat[from] ?? 0;
            chroma[to] = fit.touched[from] === 1 ? (tint[from] ?? 0) : 0;
            touched[to] = fit.touched[from] ?? 0;
        }
    }

    return {
        alpha,
        // What to invent is decided frame by frame, against the frame.
        rebuild: new Float32Array(alpha.length),
        touched,
        halo: new Float32Array(alpha.length * 3),
        coverage: countMask(touched) / touched.length,
        peak: fit.wordmark.lift,
        neutral: { color, chroma },
    };
}

/**
 * Whether a row of glyphs is the mark, when a lone mark was found as well.
 *
 * The lone detector always finds *something* — handed a wordmark it commits to one
 * letter of it, handed a busy corner it commits to a piece of the artwork — so a
 * row outranks it. The exception is the one case where both are really there: a
 * sparkle with a short caption beside it. The box is put over the sparkle, so the
 * sparkle is the thing standing in the middle of it and outside the row.
 */
export function prefersWordmark(
    wordmark: Wordmark,
    lone: WatermarkDetection,
    width: number,
    height: number,
): boolean {
    const bounds = lone.ok ? maskBounds(lone.profile.touched, width, height) : null;

    if (bounds === null) {
        return true;
    }

    const x = bounds.x + (bounds.width - 1) / 2;
    const y = bounds.y + (bounds.height - 1) / 2;
    const row = wordmark.bounds;
    const insideRow = x >= row.x && x < row.x + row.width && y >= row.y && y < row.y + row.height;
    const offCentre = Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2);

    return insideRow || offCentre > Math.min(width, height) * LONE_MARK_CENTRE_RATIO;
}
