import type { PixelBox, WatermarkDetection, WatermarkProfile } from "../types";
import { inpaintRegion, relaxationPassesFor } from "./inpaint";
import {
    ALPHA_EDGE_STEP,
    ALPHA_FLOOR,
    ALPHA_INPAINT_FULL,
    ALPHA_INPAINT_START,
    DETECT_BACKGROUND_RADIUS_RATIO,
    DETECT_DILATION_RATIO,
    DETECT_EROSION_RATIO,
    DETECT_GLOW_RATIO,
    DETECT_MIN_DELTA,
    DETECT_MIN_GLOW_DELTA,
    DETECT_MAX_EROSION_RATIO,
    DETECT_MIN_PEAK,
    DETECT_PEAK_RATIO,
    DETECT_ROUGH_GLOW_RATIO,
    DETECT_SMOOTH_RADIUS,
    HALO_FLOOR_LEVELS,
    HALO_MAX_LEVELS,
    HALO_MAX_MODEL_MISS,
    HALO_MIN_RING_PIXELS,
    HALO_TAPER_PX,
    HALO_TAPER_RINGS,
    HALO_RINGS,
    MARK_OPENING_RATIO,
    MARK_REACH_RATIO,
    MAX_BACKGROUND_HOLE_COVERAGE,
    MAX_COMPONENT_SPAN_RATIO,
    MAX_MARK_COVERAGE,
    MAX_REACH_RATIO,
    MAX_REACH_STEPS,
    MIN_ALPHA_HEADROOM,
    MIN_DILATION_PX,
    MIN_EROSION_PX,
    MIN_MARK_COVERAGE,
    MIN_REACH_PX,
    MIN_RIM_PX,
    REACH_GROWTH,
    REACH_PROBE_DEFICIT,
    REACH_PROBE_PX,
    REACH_RIM_PX,
    REBUILD_EDGE_RATIO,
    REBUILD_FEATHER_RATIO,
    REBUILD_WEIGHT_FLOOR,
    RESIDUAL_BIAS,
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

/** Shrinks every set region by `radius`, as two passes of a one-dimensional minimum. */
export function erodeMask(
    mask: Uint8Array,
    width: number,
    height: number,
    radius: number,
): Uint8Array {
    if (radius < 1) {
        return Uint8Array.from(mask);
    }

    // Eroding is dilating the complement, so there is one implementation of the
    // sliding window rather than two that have to stay in step.
    const inverted = Uint8Array.from(mask, (value) => (value === 1 ? 0 : 1));
    const grown = dilateMask(inverted, width, height, radius);

    return Uint8Array.from(grown, (value) => (value === 1 ? 0 : 1));
}

/**
 * The mark, with everything thin that touches it parted from it first.
 *
 * Erode, choose, dilate back — a morphological opening around the component
 * step. The erosion parts every join a few pixels wide, the choice keeps the
 * blob in the middle, and the dilation returns it to its own size.
 *
 * The erosion escalates rather than being one number, because one number cannot
 * be right. It has to exceed half the thickness of whatever is fused to the
 * mark, and how thick a caption is has nothing to do with the size of the box
 * somebody drew. A fixed erosion of seven pixels left two rows of a sixteen-pixel
 * caption bar standing, still joined to the sparkle, so the blob in the middle
 * spanned the whole box — and `selectCentralComponent`, correctly, refused it as
 * too wide to be a mark. What came back instead was some fragment elsewhere, and
 * every later step was then measuring the wrong object.
 *
 * So: open harder until what is in the middle is compact enough to be a mark,
 * and stop at the first radius that manages it. A glyph that is already compact
 * is answered on the first try and never eroded at all.
 */
function isolateMark(
    mask: Uint8Array,
    width: number,
    height: number,
    minErosion: number,
    maxErosion: number,
): Uint8Array | null {
    for (let erosion = minErosion; erosion <= maxErosion; erosion += 1) {
        const parted = selectCentralComponent(
            erodeMask(mask, width, height, erosion),
            width,
            height,
        );

        if (parted === null) {
            continue;
        }

        // Grown back only into pixels the threshold had already claimed, so the
        // dilation cannot push the mark out past its own edge.
        return intersectMasks(dilateMask(parted, width, height, erosion), mask);
    }

    return null;
}

/**
 * Keeps the one connected blob nearest the middle of the box, and drops the rest.
 *
 * This is the step that tells a watermark from everything else bright in a
 * corner, and without it the tool is not usable on real footage. The corners of
 * generated clips are busy: a caption sitting still for eight seconds, the lit
 * edge of a card, a honeycomb pattern laid over the artwork. All of them are
 * bright, all of them hold still, and the "what does not move is the mark"
 * premise cannot separate them from a sparkle on brightness alone — on one real
 * clip the flood ran from the sparkle through a subtitle and across a card until
 * it covered 324x317 of a 400-pixel window.
 *
 * What *does* separate them is the contract the box already implies: the reader
 * put it over the mark, so the mark is the thing in the middle. Everything else
 * inside the box is scenery, however bright it is, and a blob spanning most of
 * the box is not a mark at all.
 */
export function selectCentralComponent(
    mask: Uint8Array,
    width: number,
    height: number,
): Uint8Array | null {
    const labels = new Int32Array(mask.length).fill(-1);
    const centreX = (width - 1) / 2;
    const centreY = (height - 1) / 2;
    const limit = Math.max(width, height) * MAX_COMPONENT_SPAN_RATIO;

    let best: { label: number; distance: number } | null = null;
    let label = 0;

    for (let seed = 0; seed < mask.length; seed += 1) {
        if (mask[seed] !== 1 || labels[seed] !== -1) {
            continue;
        }

        const queue: number[] = [seed];
        let left = width;
        let top = height;
        let right = -1;
        let bottom = -1;

        labels[seed] = label;

        for (let head = 0; head < queue.length; head += 1) {
            const index = queue[head] ?? 0;
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

                    if (mask[neighbour] !== 1 || labels[neighbour] !== -1) {
                        continue;
                    }

                    labels[neighbour] = label;
                    queue.push(neighbour);
                }
            }
        }

        // Too wide or too tall to be a corner mark, whatever else it is.
        if (right - left + 1 <= limit && bottom - top + 1 <= limit) {
            const distance = Math.hypot((left + right) / 2 - centreX, (top + bottom) / 2 - centreY);

            if (best === null || distance < best.distance) {
                best = { label, distance };
            }
        }

        label += 1;
    }

    if (best === null) {
        return null;
    }

    const chosen = new Uint8Array(mask.length);

    for (let index = 0; index < mask.length; index += 1) {
        chosen[index] = labels[index] === best.label ? 1 : 0;
    }

    return chosen;
}

/** A filled circle, in the box's own coordinates. */
export function discMask(
    width: number,
    height: number,
    centreX: number,
    centreY: number,
    radius: number,
): Uint8Array {
    const mask = new Uint8Array(width * height);
    const limit = radius * radius;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const dx = x - centreX;
            const dy = y - centreY;

            mask[y * width + x] = dx * dx + dy * dy <= limit ? 1 : 0;
        }
    }

    return mask;
}

/** Set only where both are. */
export function intersectMasks(left: Uint8Array, right: Uint8Array): Uint8Array {
    return Uint8Array.from(left, (value, index) => (value === 1 && right[index] === 1 ? 1 : 0));
}

/** Set exactly where the other is not. */
export function invertMask(mask: Uint8Array): Uint8Array {
    return Uint8Array.from(mask, (value) => (value === 1 ? 0 : 1));
}

/** Set where either is. */
export function unionMasks(left: Uint8Array, right: Uint8Array): Uint8Array {
    return Uint8Array.from(left, (value, index) => (value === 1 || right[index] === 1 ? 1 : 0));
}

/**
 * The region the background estimate is interpolated across: the mark's reach,
 * plus every other bright standing thing in the box so the fill cannot read its
 * answer off one.
 *
 * Falls back to the reach alone when that would leave too little of the box to
 * read from — an estimate off a thin border is poor, but an estimate off nothing
 * is not an estimate.
 */
function holeForBackground(
    reach: Uint8Array,
    standing: Uint8Array,
    width: number,
    height: number,
): Uint8Array {
    const hole = unionMasks(reach, dilateMask(standing, width, height, MIN_DILATION_PX));

    return countMask(hole) > hole.length * MAX_BACKGROUND_HOLE_COVERAGE ? reach : hole;
}

/**
 * The background under the mark, fitted from the picture around it rather than
 * interpolated in from its border.
 *
 * A harmonic fill knows exactly one thing: the values on the rim of the hole.
 * Over a hole a hundred and thirty pixels across that is not enough — the fill
 * sags toward a surface whose only constraint is that rim, and on a corner with
 * any curvature to it the middle comes out systematically off. Measured against
 * the true background, taken from the same clip encoded without the mark, that
 * bias was the *entire* remaining opacity error: hand the fit a true background
 * and it lands within 0.007 everywhere, hand it the interpolated one and it is
 * 0.022 low across the whole glow.
 *
 * The premise the module already rests on says what to do instead. Averaging a
 * moving corner over two dozen moments leaves a gradient rather than detail —
 * so the background is not just smooth, it is *low order*, and a low-order
 * surface can be fitted to every pixel outside the mark and then evaluated
 * inside it. That is extrapolation from hundreds of pixels rather than
 * interpolation from a ring.
 *
 * The residual is still filled in harmonically on top, so whatever the surface
 * does not capture near the rim is still carried inward. Model for the shape,
 * fill for the rest.
 */
export function fitSmoothBackground(
    channels: Float32Array,
    width: number,
    height: number,
    exclude: Uint8Array,
): Float32Array {
    const terms = (x: number, y: number): readonly number[] => {
        // Normalised to [-1, 1] so the normal equations stay conditioned.
        const u = (2 * x) / Math.max(1, width - 1) - 1;
        const v = (2 * y) / Math.max(1, height - 1) - 1;

        return [1, u, v, u * u, u * v, v * v];
    };

    const size = 6;
    const model = new Float32Array(channels.length);

    for (let channel = 0; channel < 3; channel += 1) {
        // Normal equations: (BᵀB)c = Bᵀz, accumulated in one pass.
        const normal = new Float64Array(size * size);
        const target = new Float64Array(size);
        let used = 0;

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = y * width + x;

                if (exclude[index] === 1) {
                    continue;
                }

                const basis = terms(x, y);
                const value = channels[index * 3 + channel] ?? 0;

                used += 1;

                for (let row = 0; row < size; row += 1) {
                    const weight = basis[row] ?? 0;

                    target[row] += weight * value;

                    for (let column = 0; column < size; column += 1) {
                        normal[row * size + column] += weight * (basis[column] ?? 0);
                    }
                }
            }
        }

        const coefficients = used < size * 4 ? null : solveSymmetric(normal, target, size);

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = y * width + x;

                if (coefficients === null) {
                    // Not enough picture outside the mark to fit anything. The
                    // harmonic fill on top then does all of the work, which is
                    // where this started.
                    model[index * 3 + channel] = channels[index * 3 + channel] ?? 0;
                    continue;
                }

                const basis = terms(x, y);
                let value = 0;

                for (let row = 0; row < size; row += 1) {
                    value += (coefficients[row] ?? 0) * (basis[row] ?? 0);
                }

                model[index * 3 + channel] = value;
            }
        }
    }

    return model;
}

/** Gaussian elimination with partial pivoting. Null when the system is singular. */
function solveSymmetric(
    matrix: Float64Array,
    vector: Float64Array,
    size: number,
): Float64Array | null {
    const a = Float64Array.from(matrix);
    const b = Float64Array.from(vector);

    for (let column = 0; column < size; column += 1) {
        let pivot = column;

        for (let row = column + 1; row < size; row += 1) {
            if (Math.abs(a[row * size + column] ?? 0) > Math.abs(a[pivot * size + column] ?? 0)) {
                pivot = row;
            }
        }

        if (Math.abs(a[pivot * size + column] ?? 0) < 1e-9) {
            return null;
        }

        if (pivot !== column) {
            for (let k = 0; k < size; k += 1) {
                const swap = a[column * size + k] ?? 0;

                a[column * size + k] = a[pivot * size + k] ?? 0;
                a[pivot * size + k] = swap;
            }

            const swap = b[column] ?? 0;

            b[column] = b[pivot] ?? 0;
            b[pivot] = swap;
        }

        for (let row = column + 1; row < size; row += 1) {
            const factor = (a[row * size + column] ?? 0) / (a[column * size + column] ?? 1);

            if (factor === 0) {
                continue;
            }

            b[row] -= factor * (b[column] ?? 0);

            for (let k = column; k < size; k += 1) {
                a[row * size + k] -= factor * (a[column * size + k] ?? 0);
            }
        }
    }

    const solution = new Float64Array(size);

    for (let row = size - 1; row >= 0; row -= 1) {
        let total = b[row] ?? 0;

        for (let k = row + 1; k < size; k += 1) {
            total -= (a[row * size + k] ?? 0) * (solution[k] ?? 0);
        }

        solution[row] = total / (a[row * size + row] ?? 1);
    }

    return solution;
}

/** The values under a mask, for a peak that ignores whatever else is in the box. */
function maskedValues(values: Float32Array, mask: Uint8Array): Float32Array {
    return Float32Array.from(values, (value, index) => (mask[index] === 1 ? value : 0));
}

/**
 * Every connected blob of `mask` that any pixel of `seed` falls inside, or
 * `null` when the seed lands on nothing.
 *
 * The seed is the core the first pass already committed to. Growing *from* it
 * rather than choosing again is what stops the second pass — which has a far
 * more sensitive threshold, because it is looking for a faint glow — from
 * quietly deciding that some brighter thing elsewhere in the box was the
 * watermark all along.
 */
export function componentsTouching(
    mask: Uint8Array,
    width: number,
    height: number,
    seed: Uint8Array,
): Uint8Array | null {
    const kept = new Uint8Array(mask.length);
    const queue: number[] = [];

    for (let index = 0; index < mask.length; index += 1) {
        if (seed[index] === 1 && mask[index] === 1 && kept[index] === 0) {
            kept[index] = 1;
            queue.push(index);
        }
    }

    if (queue.length === 0) {
        return null;
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

                if (mask[neighbour] !== 1 || kept[neighbour] === 1) {
                    continue;
                }

                kept[neighbour] = 1;
                queue.push(neighbour);
            }
        }
    }

    return kept;
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
    return {
        alpha: new Float32Array(width * height).fill(1),
        rebuild: new Float32Array(width * height).fill(1),
        touched: new Uint8Array(width * height).fill(1),
        halo: new Float32Array(width * height * 3),
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
 * With `B` in hand, each channel offers `a = (M − B) / (W − B)` — and averaging
 * those three ratios is the wrong way to combine them. Over a bright corner one
 * channel's `W − B` can be a handful of levels, so a couple of levels of noise in
 * `M − B` becomes an opacity of a quarter, and un-blending on that subtracts
 * sixty levels of white that were never there. That is exactly what a dark,
 * blotchy, faintly coloured patch in the corner of a finished clip is.
 *
 * So the three channels are fitted at once instead, weighted by the headroom
 * each of them actually has: `a = Σ(M − B)(W − B) / Σ(W − B)²`. A channel with
 * no room to say anything contributes almost nothing to either sum, and the two
 * that do have room decide the answer.
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

        let lift = 0;
        let weight = 0;

        for (let channel = 0; channel < 3; channel += 1) {
            const under = background[index * 4 + channel] ?? 0;
            const headroom = WATERMARK_COLOR - under;

            if (headroom < MIN_ALPHA_HEADROOM) {
                continue;
            }

            lift += ((channels[index * 3 + channel] ?? 0) - under) * headroom;
            weight += headroom * headroom;
        }

        // No channel with room to speak means the corner is already as bright as
        // the mark. Nothing there can be seen, so nothing there is touched — the
        // old code called that fully opaque, which repainted a patch of picture
        // it had no evidence about.
        alpha[index] = weight === 0 ? 0 : Math.min(1, Math.max(0, lift / weight));
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

    const standing = hysteresisMask(
        roughDelta,
        width,
        height,
        Math.max(DETECT_MIN_DELTA, roughPeak * DETECT_PEAK_RATIO),
        Math.max(DETECT_MIN_GLOW_DELTA, roughPeak * DETECT_ROUGH_GLOW_RATIO),
    );

    const seed = isolateMark(
        standing,
        width,
        height,
        Math.max(MIN_EROSION_PX, Math.round(reference * DETECT_EROSION_RATIO)),
        Math.max(MIN_EROSION_PX, Math.round(reference * DETECT_MAX_EROSION_RATIO)),
    );

    const seedBounds = seed === null ? null : maskBounds(seed, width, height);

    if (seed === null || seedBounds === null) {
        return { ok: false, reason: "mark_not_found" };
    }

    // --- The reach. Everything after this happens inside one disc, and the disc
    // grows until the mark stops pressing on it.
    //
    // A glow belongs to the glyph casting it, so a first guess can be had from
    // the core's own radius — but only a guess. The band-pass that finds the core
    // measures it against a wide blur, and a bright caption a few pixels away
    // lifts that blur and shrinks the core it reports: on a corner with a
    // subtitle under the mark, a 50-pixel sparkle came back as 20. Sizing the
    // disc off that once put every later step inside a circle less than half the
    // mark's radius, and what fell outside it stayed in the picture.
    //
    // So the guess is only where the search starts. Measure, and if the mark
    // reaches the rim of the disc it was measured in, the disc was too small —
    // widen it and measure again. What that converges on is the radius at which
    // the mark has stopped, which is the thing actually wanted and is not
    // knowable in advance.
    const half = Math.max(seedBounds.width, seedBounds.height) / 2;
    const centreX = seedBounds.x + (seedBounds.width - 1) / 2;
    const centreY = seedBounds.y + (seedBounds.height - 1) / 2;
    const ceiling = reference * MAX_REACH_RATIO;

    let radius = Math.min(ceiling, Math.max(MIN_REACH_PX, half * MARK_REACH_RATIO));
    let measured: MarkMeasurement | null = null;

    for (let attempt = 0; attempt <= MAX_REACH_STEPS; attempt += 1) {
        const step = measureMark({ channels, smooth, standing, seed }, width, height, {
            centreX,
            centreY,
            radius,
        });

        if (step === null) {
            return { ok: false, reason: "mark_not_found" };
        }

        measured = step;

        if (!step.pressing || radius >= ceiling) {
            break;
        }

        radius = Math.min(ceiling, radius * REACH_GROWTH);
    }

    if (measured === null) {
        return { ok: false, reason: "mark_not_found" };
    }

    const touched = intersectMasks(
        dilateMask(
            measured.mark,
            width,
            height,
            Math.max(MIN_DILATION_PX, Math.round(reference * DETECT_DILATION_RATIO)),
        ),
        measured.reach,
    );

    const coverage = countMask(touched) / touched.length;

    if (coverage < MIN_MARK_COVERAGE || coverage > MAX_MARK_COVERAGE) {
        return { ok: false, reason: "mark_not_found" };
    }

    // Deliberately not smoothed.
    //
    // Blurring the opacity map is the obvious defence against a speckled
    // estimate, and it was tried: it costs up to two tenths of opacity across a
    // sparkle's thin arms, where the map has real structure a pixel wide, and
    // buys nothing over the glow, where it is already flat. The speckles came
    // from the estimator and from an unbounded subtraction, and both of those
    // are fixed where they happen — in the headroom-weighted fit above, and in
    // the physical bound `removeOverlay` applies per pixel.
    const alpha = estimateAlpha(channels, measured.under, touched);

    return {
        ok: true,
        profile: {
            alpha,
            rebuild: planRebuild(alpha, width, height, reference),
            touched,
            // The dark half is only subtracted where the background estimate is
            // good enough for the measurement to be about the mark.
            //
            // It is four to seven levels deep. Where the smooth surface tracks
            // the corner to within a level or two — which is most footage — that
            // is a comfortable margin and removing it takes a real ring out of
            // the picture. Where the corner defeats the surface, the same
            // arithmetic measures the surface's mistakes instead, and painting
            // those back in is worse than leaving the ring: measured on a clip
            // with a busy patterned corner, it made the result worse, and on a
            // clip with a smooth one it made it better.
            halo:
                measured.modelMiss > HALO_MAX_MODEL_MISS
                    ? new Float32Array(channels.length)
                    : measureHalo(
                          channels,
                          measured.under,
                          alpha,
                          measured.reach,
                          width,
                          height,
                          centreX,
                          centreY,
                      ),
            coverage,
            peak: measured.peak,
        },
    };
}

/**
 * The shallow dark ring the mark leaves outside its own glyph.
 *
 * Taken straight from the averaged corner minus the background under it, kept
 * only where it is negative, only inside the mark's reach, and only where the
 * bright half has nothing to say. The un-blend handles everywhere `a > 0`; this
 * is the remainder, and the two never touch the same pixel.
 *
 * Bounded on both sides. Below the floor a ring cannot be seen and is not worth
 * the risk of being a background estimate's noise; above the ceiling it is far
 * deeper than either real clip's, which means the background estimate has gone
 * wrong rather than that the mark is unusual — and subtracting a negative number
 * that large would paint a bright ring into the picture.
 *
 * And **radial**, which is the part that makes it safe. Taken pixel by pixel this
 * measures two things at once: the mark's dark half, and the background
 * estimate's own error — which on a structured corner is four levels typically
 * and sixteen in the tail, far more than the ring being looked for. Subtracting
 * that pixel by pixel paints the estimator's mistakes into the picture as a
 * smeared patch the size of the search box, which is worse than the ring.
 *
 * A ring belongs to a fixed graphic, so whatever it is, it is arranged around
 * the mark's centre. An estimator's error is not. Averaging each ring of pixels
 * before subtracting keeps the first and cancels the second, and costs one pass.
 */
function measureHalo(
    channels: Float32Array,
    under: Uint8ClampedArray,
    alpha: Float32Array,
    reach: Uint8Array,
    width: number,
    height: number,
    centreX: number,
    centreY: number,
): Float32Array {
    const halo = new Float32Array(channels.length);
    const sums = new Float64Array(HALO_RINGS * 3);
    const counts = new Float64Array(HALO_RINGS);
    const span = Math.max(1, Math.max(width, height) / 2);
    const ringOf = (x: number, y: number): number =>
        Math.min(
            HALO_RINGS - 1,
            Math.floor((Math.hypot(x - centreX, y - centreY) / span) * HALO_RINGS),
        );

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;

            if (reach[index] !== 1 || (alpha[index] ?? 0) > ALPHA_FLOOR) {
                continue;
            }

            const ring = ringOf(x, y);

            counts[ring] += 1;

            for (let channel = 0; channel < 3; channel += 1) {
                sums[ring * 3 + channel] +=
                    (channels[index * 3 + channel] ?? 0) - (under[index * 4 + channel] ?? 0);
            }
        }
    }

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;

            if (reach[index] !== 1 || (alpha[index] ?? 0) > ALPHA_FLOOR) {
                continue;
            }

            const ring = ringOf(x, y);
            const seen = counts[ring] ?? 0;

            if (seen < HALO_MIN_RING_PIXELS) {
                continue;
            }

            // Faded to nothing at both edges it can meet, because a correction
            // that stops abruptly draws its own boundary into the picture.
            //
            // One edge is the disc's, which is round. The other is the search
            // box's, which is **square** — and when the disc grows large enough
            // to be clipped by it, an untapered correction leaves a hard
            // rectangle in the middle of the frame. It is not subtle: it is the
            // most visible thing in the output, and it is not part of the mark
            // at all.
            const fade = Math.min(
                1,
                (HALO_RINGS - 1 - ring) / HALO_TAPER_RINGS,
                Math.min(x, y, width - 1 - x, height - 1 - y) / HALO_TAPER_PX,
            );

            if (fade <= 0) {
                continue;
            }

            for (let channel = 0; channel < 3; channel += 1) {
                const average = (sums[ring * 3 + channel] ?? 0) / seen;

                if (average > -HALO_FLOOR_LEVELS || average < -HALO_MAX_LEVELS) {
                    continue;
                }

                halo[index * 3 + channel] = average * fade;
            }
        }
    }

    return halo;
}

/** The same window out of a three-channel field, in the window's own coordinates. */
export function cropChannels(
    channels: Float32Array,
    width: number,
    height: number,
    box: PixelBox,
): Float32Array {
    const cropped = new Float32Array(box.width * box.height * 3);

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

            const to = (y * box.width + x) * 3;
            const from = (sourceY * width + sourceX) * 3;

            for (let channel = 0; channel < 3; channel += 1) {
                cropped[to + channel] = channels[from + channel] ?? 0;
            }
        }
    }

    return cropped;
}

/** What one candidate reach says the mark is, and whether the disc confined it. */
type MarkMeasurement = {
    /** The averaged corner with everything bright rebuilt out of it. */
    readonly under: Uint8ClampedArray;
    /** The mark itself, before the final fringe dilation. */
    readonly mark: Uint8Array;
    readonly reach: Uint8Array;
    readonly peak: number;
    /** How far the smooth surface sits from the picture where the picture is known. */
    readonly modelMiss: number;
    /** The mark runs into the rim, so this disc is smaller than the mark. */
    readonly pressing: boolean;
};

/**
 * One measurement of the mark, inside one candidate disc.
 *
 * Everything here is bounded by that disc on purpose, including the peak the
 * thresholds are derived from: a caption outside the reach used to set the peak,
 * and with it every threshold, so the mark was measured against the brightness
 * of something that is not the mark.
 */
function measureMark(
    average: {
        readonly channels: Float32Array;
        readonly smooth: Float32Array;
        readonly standing: Uint8Array;
        readonly seed: Uint8Array;
    },
    width: number,
    height: number,
    disc: { readonly centreX: number; readonly centreY: number; readonly radius: number },
): MarkMeasurement | null {
    const { channels, smooth, standing, seed } = average;
    const reach = discMask(width, height, disc.centreX, disc.centreY, disc.radius);

    // The disc alone is not enough for the border to be clean, because scenery
    // crosses it. A caption running under the mark reaches out of the disc and
    // is *on the rim* — and a harmonic fill takes its answer from exactly there,
    // so a bright bar across the border lifts the whole estimate and the mark
    // measures as fainter than it is.
    //
    // So everything bright and standing still goes into the hole, whether or not
    // it turned out to be the mark. Only the values inside the disc are ever
    // read, so filling across a caption as well costs nothing and buys a border
    // made of footage.
    const hole = holeForBackground(reach, standing, width, height);
    const model = fitSmoothBackground(channels, width, height, hole);

    // How much of the corner the smooth surface fails to explain, measured where
    // the answer is known: outside the hole, where the data is right there.
    //
    // This is the error bar on everything the surface is later asked to say
    // about the inside of the hole, and on a real clip it is the difference
    // between a corner the model describes almost exactly and one it does not
    // describe at all. It decides whether a measurement of the mark's dark half
    // is a measurement of the mark or of the model.
    let miss = 0;
    let counted = 0;

    for (let index = 0; index < hole.length; index += 1) {
        if (hole[index] === 1) {
            continue;
        }

        for (let channel = 0; channel < 3; channel += 1) {
            const gap = (channels[index * 3 + channel] ?? 0) - (model[index * 3 + channel] ?? 0);

            miss += gap * gap;
            counted += 1;
        }
    }

    const modelMiss = counted === 0 ? Infinity : Math.sqrt(miss / counted);

    // The fit gives the shape; the fill carries whatever it missed inward from
    // the rim. Working on the residual means the fill starts from a surface that
    // is already close, so what it has to invent is small.
    const residual = channelsToRgba(
        Float32Array.from(channels, (value, index) => value - (model[index] ?? 0) + RESIDUAL_BIAS),
    );

    inpaintRegion(residual, width, height, hole, passesFor(hole, width, height));

    const under = new Uint8ClampedArray((model.length / 3) * 4);

    for (let index = 0; index < model.length / 3; index += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
            under[index * 4 + channel] =
                (model[index * 3 + channel] ?? 0) +
                (residual[index * 4 + channel] ?? 0) -
                RESIDUAL_BIAS;
        }

        under[index * 4 + 3] = 255;
    }

    const delta = liftOver(smooth, lumaFromRgba(under));
    const peak = peakOf(maskedValues(delta, reach));

    if (peak < DETECT_MIN_PEAK) {
        return null;
    }

    const grown = intersectMasks(
        hysteresisMask(
            delta,
            width,
            height,
            Math.max(DETECT_MIN_DELTA, peak * DETECT_PEAK_RATIO),
            Math.max(DETECT_MIN_GLOW_DELTA, peak * DETECT_GLOW_RATIO),
        ),
        reach,
    );

    // The scenery that survives the reach is what *touches* the mark: a caption
    // running under it, the lit edge of a card, a honeycomb seam laid over the
    // artwork. They are joined to it, so no connectivity rule parts them — but
    // they are thin and the mark is not. Erode by a fraction of the reach, keep
    // what still touches the core the first pass committed to, and dilate back.
    const erosion = Math.max(MIN_EROSION_PX, Math.round(disc.radius * MARK_OPENING_RATIO));
    const kept = componentsTouching(erodeMask(grown, width, height, erosion), width, height, seed);

    if (kept === null) {
        return null;
    }

    const mark = intersectMasks(dilateMask(kept, width, height, erosion), grown);

    // Two questions, because the mark reaches outward in two different ways and
    // no single test sees both.
    //
    // The bright glow shows up in the *residual* on the disc's rim: it is what
    // the fill could not account for, and the old test looked exactly there.
    // The dark ring does not show up there at all — the background is fitted to
    // everything outside the hole, so outside the hole the residual is zero by
    // construction, and the test was asking a question whose answer was built
    // in. For that half the signal has to be read against the *smooth model*,
    // which cannot follow a ring, in a band beyond the disc.
    //
    // Dropping either one stops the disc at whichever half comes first, and
    // both were measured: with only the ring test the synthetic clips' residue
    // tripled, with only the glow test both real clips kept their halo.
    //
    // A band just **outside** the disc, compared against the smooth model rather
    // than against the finished background estimate.
    //
    // The obvious test — is the residual flat on the rim — cannot work, and it
    // took a fixture with a known dark ring to notice. The background is fitted
    // to everything outside the hole, so outside the hole the residual is zero
    // by construction: the test was asking a question whose answer was built in.
    // The smooth model cannot follow a ring, so data sitting below *it* is the
    // signal, and it is readable exactly where the residual is not.
    //
    // Two-sided, and above the model's own error, because the model has one.
    const outside = intersectMasks(
        dilateMask(reach, width, height, REACH_PROBE_PX),
        invertMask(reach),
    );
    const modelLuma = lumaFromChannels(model);
    const dataLuma = lumaFromChannels(channels);
    const beyond = Float32Array.from(dataLuma, (value, index) => value - (modelLuma[index] ?? 0));
    const rim = intersectMasks(reach, invertMask(erodeMask(reach, width, height, REACH_RIM_PX)));

    // Whether the disc is still inside the mark, asked of the picture rather
    // than of the threshold — and asked of its **magnitude**, because the mark
    // reaches outward in two directions. The bright glyph is only half of it;
    // outside that there is a shallow dark ring, and a test written as
    // `mean > floor` reads a band sitting five levels *below* the picture as
    // flat and stops there. Two defects hiding each other: the disc stopped at
    // the glow, so the ring fell outside it, so nothing ever measured the ring.
    //
    // Asking whether the *thresholded* mask reaches the rim is asking the wrong
    // question, because the threshold is where the glow stops being worth
    // repainting and not where it stops. Past it the glow carries on for another
    // third of its radius at a hundredth of an opacity, invisible in the output
    // and quite visible in the rim the background is read from — which lifts the
    // estimate by about ten levels and takes four hundredths off every opacity
    // in the disc.
    //
    // Four hundredths sounds like nothing. `Δa = ΔB / (255 − B)` says what it
    // costs: over a dark corner the same ten levels are a hundredth, and over a
    // corner going white they are a tenth. That is why this failed on exactly
    // the frames where a clip brightens, and why the test is an absolute lift on
    // the rim rather than anything scaled to the peak.
    return {
        under,
        mark,
        reach,
        peak,
        modelMiss,
        pressing:
            countMask(intersectMasks(mark, rim)) > 0 ||
            Math.abs(meanOver(beyond, outside)) > REACH_PROBE_DEFICIT,
    };
}

/** The mean of `values` over the set pixels of `mask`, or zero when none are set. */
function meanOver(values: Float32Array, mask: Uint8Array): number {
    let total = 0;
    let count = 0;

    for (let index = 0; index < mask.length; index += 1) {
        if (mask[index] === 1) {
            total += values[index] ?? 0;
            count += 1;
        }
    }

    return count === 0 ? 0 : total / count;
}

/**
 * How much of each pixel has to be rebuilt rather than recovered.
 *
 * Two places the un-blend cannot answer for, and they are answered together
 * because both want the same treatment:
 *
 * - **The solid middle.** Dividing by `1 − a` multiplies the frame's own noise by
 *   `1/(1 − a)`, so past about half covered what comes back is mostly amplified
 *   grain. Ramped in from `START` to `FULL` rather than switched at a line: a
 *   hard boundary between recovered and rebuilt pixels is itself an edge, drawn
 *   along a contour of the mark.
 * - **The outline.** A codec rings at a hard edge, and that ringing is a fact
 *   about one frame's encoding rather than about the mark, so it is not in the
 *   averaged frames and no opacity can subtract it. Rebuilt outright, at full
 *   weight, across a band a couple of pixels wide.
 */
function planRebuild(
    alpha: Float32Array,
    width: number,
    height: number,
    reference: number,
): Float32Array {
    const band = Math.max(ALPHA_INPAINT_FULL - ALPHA_INPAINT_START, 1e-6);

    // The mark's own outline, wherever the opacity turns over quickly.
    //
    // Two different defects live on that contour and both want the same answer.
    // A codec cannot encode a hard edge exactly — it rings, and it carries the
    // chroma of a 2x2 block that is half mark and half footage, neither of which
    // an opacity can subtract because neither is in the averaged frames. And the
    // cross-fade between recovered and rebuilt pixels is written in opacity, so
    // where the opacity crosses the ramp within a single pixel the fade is not a
    // fade at all: it is a switch, drawn along a contour of the mark.
    //
    // This is the *only* band rebuilt outright. An earlier version also rebuilt
    // a ring around the outside of `alpha > ALPHA_FLOOR`, on the same reasoning
    // about ringing, and on synthetic marks it looked harmless — a thin ring
    // around a clean disc, worth about two tenths of a level. On a real clip
    // that threshold is not a disc. It is speckle: a hundredth of an opacity is
    // below the noise in an estimate made from two dozen compressed frames, so
    // the region is ragged, and `dilate(ragged) − erode(ragged)` is not a ring,
    // it is **everything**. The map came back covering most of the work rect and
    // the tool inpainted the whole corner over footage it had already cleaned
    // correctly.
    //
    // A threshold set at the noise floor describes the noise. Ringing lives
    // where the mark has an edge, so ask for the edge.
    // …and only for a mark strong enough to be worth it, which is a fact about
    // the mark and not about each pixel.
    //
    // What the band covers — a codec's ringing at a hard edge, and a chroma
    // sample straddling it — scales with the contrast of that edge, which scales
    // with the opacity. At nine tenths covered it is worth far more than what a
    // fill invents in its place. At a third covered there is no hard edge to
    // ring, and the band simply replaces correctly recovered pixels with
    // invented ones.
    //
    // Both real clips peak at 0.32, and this is the difference between a core
    // error of 10.6 levels and one of 4.9 — measured against ground truth, by
    // planting a known mark on the clip's own footage where the truth is still
    // there to compare with. An earlier reading said the opposite; it came from a
    // metric with no truth in it, and it was wrong.
    const steep = dilateMask(
        steepAlpha(alpha, width, height),
        width,
        height,
        Math.max(MIN_RIM_PX, Math.round(reference * REBUILD_EDGE_RATIO)),
    );

    const rebuild = new Float32Array(alpha.length);

    for (let index = 0; index < alpha.length; index += 1) {
        const core = Math.min(1, Math.max(0, ((alpha[index] ?? 0) - ALPHA_INPAINT_START) / band));

        rebuild[index] = Math.max(core, steep[index] === 1 ? 1 : 0);
    }

    // Feathered in space rather than in opacity, which is the whole point. How
    // much of a pixel to invent is decided by its opacity; how *abruptly* that
    // decision may change from one pixel to the next is a separate question, and
    // answering it in opacity means a mark with a hard edge gets no fade at all.
    // Smoothing the weight map is not smoothing the estimate: one is a
    // measurement and must not be blurred, the other is a blend control and must.
    return Float32Array.from(
        boxBlur(rebuild, width, height, Math.max(1, Math.round(reference * REBUILD_FEATHER_RATIO))),
        // A weight this small changes nothing a byte can hold, and the fill's
        // hole is drawn from where the weight is non-zero — so a long feathered
        // tail would enlarge the interpolation on every frame to no effect.
        (value) => (value < REBUILD_WEIGHT_FLOOR ? 0 : Math.min(1, value)),
    );
}

/** Where the opacity turns over fast enough that a pixel straddles the mark's edge. */
function steepAlpha(alpha: Float32Array, width: number, height: number): Uint8Array {
    const steep = new Uint8Array(alpha.length);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;
            const here = alpha[index] ?? 0;
            let span = 0;

            for (const [dx, dy] of [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
            ] as const) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }

                span = Math.max(span, Math.abs((alpha[ny * width + nx] ?? 0) - here));
            }

            steep[index] = span >= ALPHA_EDGE_STEP ? 1 : 0;
        }
    }

    return steep;
}
