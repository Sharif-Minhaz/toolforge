import type { PixelBox, WatermarkDetection, WatermarkProfile } from "../types";
import { inpaintRegion, relaxationPassesFor } from "./inpaint";
import {
    ALPHA_OPAQUE_LIMIT,
    DETECT_BACKGROUND_RADIUS_RATIO,
    DETECT_DILATION_RATIO,
    DETECT_GLOW_RATIO,
    DETECT_MIN_DELTA,
    DETECT_MIN_GLOW_DELTA,
    DETECT_MIN_PEAK,
    DETECT_PEAK_RATIO,
    DETECT_ROUGH_DILATION_RATIO,
    DETECT_ROUGH_GLOW_RATIO,
    DETECT_SMOOTH_RADIUS,
    MAX_MARK_COVERAGE,
    MIN_ALPHA_HEADROOM,
    MIN_DILATION_PX,
    MIN_MARK_COVERAGE,
    WATERMARK_COLOR,
} from "./video-constants";

/**
 * A running average of one rectangle of the picture, in all three channels.
 *
 * Colour is carried rather than dropped because the average is not only used to
 * *find* the mark — it is also the only evidence there is about how strongly the
 * mark covers each pixel, and that question is asked per channel.
 */
export type FrameAccumulator = {
    readonly width: number;
    readonly height: number;
    /** How many frames have been folded in. Zero means the detector has nothing. */
    count: number;
    /** Three interleaved planes, `3 * width * height`. */
    readonly sums: Float64Array;
};

export function createFrameAccumulator(width: number, height: number): FrameAccumulator {
    return { width, height, count: 0, sums: new Float64Array(width * height * 3) };
}

/** BT.601 luma, the weighting a person's eye actually applies to the three channels. */
export function lumaOf(red: number, green: number, blue: number): number {
    return 0.299 * red + 0.587 * green + 0.114 * blue;
}

/** Folds one frame's crop, as RGBA, into the average. */
export function addFrameSample(accumulator: FrameAccumulator, rgba: Uint8ClampedArray): void {
    const { sums } = accumulator;
    const pixels = sums.length / 3;

    for (let index = 0; index < pixels; index += 1) {
        const source = index * 4;
        const target = index * 3;

        sums[target] += rgba[source] ?? 0;
        sums[target + 1] += rgba[source + 1] ?? 0;
        sums[target + 2] += rgba[source + 2] ?? 0;
    }

    accumulator.count += 1;
}

/** The averaged corner, as three interleaved 0–255 planes. */
export function averageChannels(accumulator: FrameAccumulator): Float32Array {
    const average = new Float32Array(accumulator.sums.length);

    if (accumulator.count === 0) {
        return average;
    }

    for (let index = 0; index < average.length; index += 1) {
        average[index] = (accumulator.sums[index] ?? 0) / accumulator.count;
    }

    return average;
}

export function lumaFromChannels(channels: Float32Array): Float32Array {
    const luma = new Float32Array(channels.length / 3);

    for (let index = 0; index < luma.length; index += 1) {
        const offset = index * 3;

        luma[index] = lumaOf(
            channels[offset] ?? 0,
            channels[offset + 1] ?? 0,
            channels[offset + 2] ?? 0,
        );
    }

    return luma;
}

export function averageLuma(accumulator: FrameAccumulator): Float32Array {
    return lumaFromChannels(averageChannels(accumulator));
}

function blurAxis(
    source: Float32Array,
    width: number,
    height: number,
    radius: number,
    horizontal: boolean,
): Float32Array {
    const target = new Float32Array(source.length);
    const span = radius * 2 + 1;
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;

    const at = (line: number, position: number): number => {
        const clamped = Math.min(inner - 1, Math.max(0, position));

        return horizontal ? line * width + clamped : clamped * width + line;
    };

    for (let line = 0; line < outer; line += 1) {
        let window = 0;

        for (let offset = -radius; offset <= radius; offset += 1) {
            window += source[at(line, offset)] ?? 0;
        }

        for (let position = 0; position < inner; position += 1) {
            target[at(line, position)] = window / span;
            window -= source[at(line, position - radius)] ?? 0;
            window += source[at(line, position + radius + 1)] ?? 0;
        }
    }

    return target;
}

/**
 * A separable box blur with clamped edges, run as a sliding window so its cost
 * does not grow with the radius. Two of these at different radii are what
 * separate a thin bright stroke from the picture behind it.
 */
export function boxBlur(
    values: Float32Array,
    width: number,
    height: number,
    radius: number,
): Float32Array {
    if (radius < 1) {
        return Float32Array.from(values);
    }

    return blurAxis(blurAxis(values, width, height, radius, true), width, height, radius, false);
}

/** Grows every set pixel by `radius`, as two passes of a one-dimensional maximum. */
export function dilateMask(
    mask: Uint8Array,
    width: number,
    height: number,
    radius: number,
): Uint8Array {
    if (radius < 1) {
        return Uint8Array.from(mask);
    }

    const horizontal = new Uint8Array(mask.length);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let hit = 0;

            for (let offset = -radius; offset <= radius && hit === 0; offset += 1) {
                const sample = x + offset;

                if (sample >= 0 && sample < width && mask[y * width + sample] === 1) {
                    hit = 1;
                }
            }

            horizontal[y * width + x] = hit;
        }
    }

    const dilated = new Uint8Array(mask.length);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let hit = 0;

            for (let offset = -radius; offset <= radius && hit === 0; offset += 1) {
                const sample = y + offset;

                if (sample >= 0 && sample < height && horizontal[sample * width + x] === 1) {
                    hit = 1;
                }
            }

            dilated[y * width + x] = hit;
        }
    }

    return dilated;
}

/**
 * Two thresholds and a flood between them.
 *
 * Pixels above `high` are certainly the mark and become seeds; from each seed
 * the region grows through any neighbour still above `low`. A wide, faint glow
 * around a bright core is therefore kept whole, while an isolated pixel that
 * merely drifted above `low` on its own is not — it has no seed to reach it.
 *
 * The one-threshold version of this is what left a halo on the first real clip:
 * the core came out, the glow stayed, and the fill read its answer off pixels
 * that still had the glow in them.
 */
export function hysteresisMask(
    values: Float32Array,
    width: number,
    height: number,
    high: number,
    low: number,
): Uint8Array {
    const mask = new Uint8Array(values.length);
    const queue: number[] = [];

    for (let index = 0; index < values.length; index += 1) {
        if ((values[index] ?? 0) >= high) {
            mask[index] = 1;
            queue.push(index);
        }
    }

    for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head] ?? 0;
        const x = index % width;
        const y = (index - x) / width;

        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }

                const neighbour = ny * width + nx;

                if (mask[neighbour] === 1 || (values[neighbour] ?? 0) < low) {
                    continue;
                }

                mask[neighbour] = 1;
                queue.push(neighbour);
            }
        }
    }

    return mask;
}

/** The smallest rectangle holding every set pixel, or `null` when none are set. */
export function maskBounds(mask: Uint8Array, width: number, height: number): PixelBox | null {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (mask[y * width + x] !== 1) {
                continue;
            }

            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }

    if (right < 0) {
        return null;
    }

    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Copies the part of a mask that lies inside `box`, in `box`'s own coordinates. */
export function cropMask(
    mask: Uint8Array,
    width: number,
    height: number,
    box: PixelBox,
): Uint8Array {
    const cropped = new Uint8Array(box.width * box.height);

    for (let y = 0; y < box.height; y += 1) {
        const sourceY = box.y + y;

        if (sourceY < 0 || sourceY >= height) {
            continue;
        }

        for (let x = 0; x < box.width; x += 1) {
            const sourceX = box.x + x;

            if (sourceX < 0 || sourceX >= width) {
                continue;
            }

            cropped[y * box.width + x] = mask[sourceY * width + sourceX] ?? 0;
        }
    }

    return cropped;
}

/** The same window, out of an opacity map rather than a mask. */
export function cropAlpha(
    alpha: Float32Array,
    width: number,
    height: number,
    box: PixelBox,
): Float32Array {
    const cropped = new Float32Array(box.width * box.height);

    for (let y = 0; y < box.height; y += 1) {
        const sourceY = box.y + y;

        if (sourceY < 0 || sourceY >= height) {
            continue;
        }

        for (let x = 0; x < box.width; x += 1) {
            const sourceX = box.x + x;

            if (sourceX < 0 || sourceX >= width) {
                continue;
            }

            cropped[y * box.width + x] = alpha[sourceY * width + sourceX] ?? 0;
        }
    }

    return cropped;
}

export function countMask(mask: Uint8Array): number {
    let total = 0;

    for (const value of mask) {
        if (value === 1) {
            total += 1;
        }
    }

    return total;
}

/**
 * The profile for a reader who asked for the whole box repainted rather than the
 * mark inside it: everything solid, nothing to un-blend, no estimate involved.
 */
export function filledProfile(width: number, height: number): WatermarkProfile {
    const solid = new Uint8Array(width * height).fill(1);

    return {
        alpha: new Float32Array(width * height).fill(1),
        opaque: solid,
        touched: Uint8Array.from(solid),
        coverage: 1,
        peak: 0,
    };
}

function channelsToRgba(channels: Float32Array): Uint8ClampedArray {
    const pixels = channels.length / 3;
    const rgba = new Uint8ClampedArray(pixels * 4);

    for (let index = 0; index < pixels; index += 1) {
        const source = index * 3;
        const target = index * 4;

        rgba[target] = channels[source] ?? 0;
        rgba[target + 1] = channels[source + 1] ?? 0;
        rgba[target + 2] = channels[source + 2] ?? 0;
        rgba[target + 3] = 255;
    }

    return rgba;
}

/**
 * How strongly the mark covers each pixel, from the averaged corner alone.
 *
 * The averaged corner is `M = (1 − a)·B + a·W`, with `W` white and `B` the
 * average of the footage the mark is sitting on. `B` is not observable — the
 * mark is always in the way — but it is *smooth*, because averaging a moving
 * corner over two dozen moments leaves a gradient rather than detail. So `B` is
 * recovered by rebuilding the averaged corner across the marked region from its
 * own borders, which is the same harmonic fill the frames themselves get, run
 * once on the average instead of a thousand times on the footage.
 *
 * With `B` in hand each channel gives `a = (M − B) / (W − B)`, and the channels
 * are averaged over whichever of them have enough headroom to mean anything: a
 * blown-out red channel divides by nothing and says nothing, while green and
 * blue still answer.
 */
function estimateAlpha(
    channels: Float32Array,
    background: Uint8ClampedArray,
    touched: Uint8Array,
): Float32Array {
    const alpha = new Float32Array(touched.length);

    for (let index = 0; index < touched.length; index += 1) {
        if (touched[index] !== 1) {
            continue;
        }

        let total = 0;
        let used = 0;

        for (let channel = 0; channel < 3; channel += 1) {
            const under = background[index * 4 + channel] ?? 0;
            const headroom = WATERMARK_COLOR - under;

            if (headroom < MIN_ALPHA_HEADROOM) {
                continue;
            }

            total += ((channels[index * 3 + channel] ?? 0) - under) / headroom;
            used += 1;
        }

        alpha[index] = used === 0 ? 1 : Math.min(1, Math.max(0, total / used));
    }

    return alpha;
}

/** How far each pixel stands above the estimate of what is behind it, clipped at zero below. */
function liftOver(values: Float32Array, background: Float32Array): Float32Array {
    const lift = new Float32Array(values.length);

    for (let index = 0; index < lift.length; index += 1) {
        lift[index] = (values[index] ?? 0) - (background[index] ?? 0);
    }

    return lift;
}

function peakOf(values: Float32Array): number {
    let peak = 0;

    for (const value of values) {
        peak = Math.max(peak, value);
    }

    return peak;
}

/** Sizes the relaxation to the hole actually being interpolated across. */
function passesFor(mask: Uint8Array, width: number, height: number): number {
    const bounds = maskBounds(mask, width, height);

    return relaxationPassesFor(bounds === null ? 0 : Math.max(bounds.width, bounds.height));
}

function lumaFromRgba(rgba: Uint8ClampedArray): Float32Array {
    const luma = new Float32Array(rgba.length / 4);

    for (let index = 0; index < luma.length; index += 1) {
        const offset = index * 4;

        luma[index] = lumaOf(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0);
    }

    return luma;
}

/**
 * Finds the watermark inside an averaged corner and says how opaque it is.
 *
 * The averaging is what makes this work at all: over a clip whose footage moves,
 * everything except the mark washes out, so what is left standing above its own
 * neighbourhood is the mark. The band-pass — a lightly blurred copy minus a
 * broadly blurred one — is what "above its own neighbourhood" means in
 * arithmetic, and it answers the same way whether the corner is dark sky or a
 * bright wall.
 *
 * Only *brighter* than the surroundings counts. Gemini and Veo both sign in
 * white; treating a dark difference as a mark as well would light up the shadow
 * side of every edge that happens to sit in the corner.
 */
export function detectWatermark(accumulator: FrameAccumulator): WatermarkDetection {
    const { width, height } = accumulator;

    if (accumulator.count === 0 || width < 3 || height < 3) {
        return { ok: false, reason: "mark_not_found" };
    }

    const reference = Math.min(width, height);
    const channels = averageChannels(accumulator);
    const luma = lumaFromChannels(channels);
    const smooth = boxBlur(luma, width, height, DETECT_SMOOTH_RADIUS);

    // --- First pass: a blur stands in for the background, well enough to find
    // the core. It cannot do more than that. A blur wide enough to ignore a
    // sparkle's glow is wide enough to ignore the gradient it is sitting on, and
    // a blur narrow enough to follow the gradient has averaged the glow into
    // itself — so the glow measures as if it were background, and stays.
    const blurred = boxBlur(
        luma,
        width,
        height,
        Math.max(2, Math.round(reference * DETECT_BACKGROUND_RADIUS_RATIO)),
    );

    const roughDelta = liftOver(smooth, blurred);
    const roughPeak = peakOf(roughDelta);

    if (roughPeak < DETECT_MIN_PEAK) {
        return { ok: false, reason: "mark_not_found" };
    }

    const rough = dilateMask(
        hysteresisMask(
            roughDelta,
            width,
            height,
            Math.max(DETECT_MIN_DELTA, roughPeak * DETECT_PEAK_RATIO),
            Math.max(DETECT_MIN_GLOW_DELTA, roughPeak * DETECT_ROUGH_GLOW_RATIO),
        ),
        width,
        height,
        Math.max(MIN_DILATION_PX, Math.round(reference * DETECT_ROUGH_DILATION_RATIO)),
    );

    // --- Second pass: with the core cut out and interpolated across, what is
    // left is a real estimate of the footage rather than a smeared copy of the
    // mark. Measured against *that*, the glow stands out at its true height.
    const roughUnder = channelsToRgba(channels);

    inpaintRegion(roughUnder, width, height, rough, passesFor(rough, width, height));

    const delta = liftOver(smooth, lumaFromRgba(roughUnder));
    const peak = peakOf(delta);

    if (peak < DETECT_MIN_PEAK) {
        return { ok: false, reason: "mark_not_found" };
    }

    const touched = dilateMask(
        hysteresisMask(
            delta,
            width,
            height,
            Math.max(DETECT_MIN_DELTA, peak * DETECT_PEAK_RATIO),
            Math.max(DETECT_MIN_GLOW_DELTA, peak * DETECT_GLOW_RATIO),
        ),
        width,
        height,
        Math.max(MIN_DILATION_PX, Math.round(reference * DETECT_DILATION_RATIO)),
    );

    const coverage = countMask(touched) / touched.length;

    if (coverage < MIN_MARK_COVERAGE || coverage > MAX_MARK_COVERAGE) {
        return { ok: false, reason: "mark_not_found" };
    }

    // The averaged corner with the whole mark rebuilt out of it: the best
    // available answer to "what was the footage doing here, on average".
    const under = channelsToRgba(channels);

    inpaintRegion(under, width, height, touched, passesFor(touched, width, height));

    const alpha = estimateAlpha(channels, under, touched);
    const opaque = new Uint8Array(alpha.length);

    for (let index = 0; index < alpha.length; index += 1) {
        opaque[index] = (alpha[index] ?? 0) >= ALPHA_OPAQUE_LIMIT ? 1 : 0;
    }

    return { ok: true, profile: { alpha, opaque, touched, coverage, peak } };
}
