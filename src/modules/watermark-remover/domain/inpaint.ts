import {
    ALPHA_FLOOR,
    ALPHA_OPAQUE_LIMIT,
    INPAINT_RELAX_ITERATIONS,
    INPAINT_RELAX_PER_PIXEL,
    MAX_INPAINT_RELAX_ITERATIONS,
    WATERMARK_COLOR,
} from "./video-constants";

/** Diagonal neighbours are further away, so they weigh less in the first fill. */
const DIAGONAL_WEIGHT = Math.SQRT1_2;

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
    [-1, 0, 1],
    [1, 0, 1],
    [0, -1, 1],
    [0, 1, 1],
    [-1, -1, DIAGONAL_WEIGHT],
    [1, -1, DIAGONAL_WEIGHT],
    [-1, 1, DIAGONAL_WEIGHT],
    [1, 1, DIAGONAL_WEIGHT],
];

const ORTHOGONAL: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
];

/**
 * How many sweeps a hole of this size needs before its middle has heard from its
 * own edges. Neighbour averaging moves information one pixel per pass, so the
 * count has to scale with the hole rather than be a constant.
 */
export function relaxationPassesFor(span: number): number {
    return Math.min(
        MAX_INPAINT_RELAX_ITERATIONS,
        Math.max(INPAINT_RELAX_ITERATIONS, Math.round(span * INPAINT_RELAX_PER_PIXEL)),
    );
}

/**
 * Repaints every marked pixel from the picture around it, and nothing else.
 *
 * Two stages, because either alone is visibly wrong:
 *
 * 1. **Grow inward from the edge.** Marked pixels touching unmarked ones take a
 *    distance-weighted average of those neighbours and are then treated as
 *    known, so the fill advances one ring at a time until the hole is closed.
 *    This carries the surrounding colour and its gradient into the middle, but
 *    it leaves faint banding along the rings it grew in.
 * 2. **Relax it.** Repeatedly replacing each filled pixel with the average of
 *    its four neighbours drives the patch towards the smooth surface whose edges
 *    are exactly the untouched pixels around it — the discrete form of solving
 *    Laplace's equation inside the hole. The banding goes, and because the
 *    boundary values are never written to, the patch meets the original picture
 *    with no seam to blend away.
 *
 * There is no model here and no invention: a thin sparkle over a photograph is
 * a hole small enough that its own border says what belongs in it. A large hole
 * over strong texture will read as a smudge, which is the honest failure mode
 * and the reason the mark is found first rather than the whole box repainted.
 *
 * Mutates `pixels` in place. Alpha is never touched.
 */
export function inpaintRegion(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    mask: Uint8Array,
    iterations: number = INPAINT_RELAX_ITERATIONS,
): void {
    const total = width * height;
    const targets: number[] = [];

    for (let index = 0; index < total; index += 1) {
        if (mask[index] === 1) {
            targets.push(index);
        }
    }

    if (targets.length === 0 || targets.length === total) {
        // Nothing marked, or nothing left to read an answer off. Either way the
        // honest move is to leave the frame exactly as it arrived.
        return;
    }

    const work = new Float32Array(total * 3);

    for (let index = 0; index < total; index += 1) {
        const source = index * 4;
        const destination = index * 3;

        work[destination] = pixels[source] ?? 0;
        work[destination + 1] = pixels[source + 1] ?? 0;
        work[destination + 2] = pixels[source + 2] ?? 0;
    }

    growInward(work, width, height, mask, targets);
    relax(work, width, height, targets, iterations);

    for (const index of targets) {
        const source = index * 3;
        const destination = index * 4;

        pixels[destination] = work[source] ?? 0;
        pixels[destination + 1] = work[source + 1] ?? 0;
        pixels[destination + 2] = work[source + 2] ?? 0;
    }
}

function growInward(
    work: Float32Array,
    width: number,
    height: number,
    mask: Uint8Array,
    targets: readonly number[],
): void {
    // A copy, because `mask` describes what the caller wants repainted and this
    // one has to record what is still waiting as the fill advances.
    const pending = Uint8Array.from(mask);
    let remaining = targets.length;

    while (remaining > 0) {
        const frontier: number[] = [];

        for (const index of targets) {
            if (pending[index] !== 1) {
                continue;
            }

            const x = index % width;
            const y = (index - x) / width;

            for (const [dx, dy] of ORTHOGONAL) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }

                if (pending[ny * width + nx] === 0) {
                    frontier.push(index);
                    break;
                }
            }
        }

        if (frontier.length === 0) {
            // Unreachable while the caller leaves any pixel unmarked, but a
            // spin here would be a hang rather than a wrong colour.
            return;
        }

        for (const index of frontier) {
            const x = index % width;
            const y = (index - x) / width;
            let weight = 0;
            let red = 0;
            let green = 0;
            let blue = 0;

            for (const [dx, dy, share] of NEIGHBOURS) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }

                const neighbour = ny * width + nx;

                if (pending[neighbour] === 1) {
                    continue;
                }

                const offset = neighbour * 3;

                red += (work[offset] ?? 0) * share;
                green += (work[offset + 1] ?? 0) * share;
                blue += (work[offset + 2] ?? 0) * share;
                weight += share;
            }

            if (weight === 0) {
                continue;
            }

            const offset = index * 3;

            work[offset] = red / weight;
            work[offset + 1] = green / weight;
            work[offset + 2] = blue / weight;
        }

        for (const index of frontier) {
            pending[index] = 0;
            remaining -= 1;
        }
    }
}

function relax(
    work: Float32Array,
    width: number,
    height: number,
    targets: readonly number[],
    iterations: number,
): void {
    for (let pass = 0; pass < iterations; pass += 1) {
        // Alternating direction, so a sweep does not always push the freshly
        // averaged values the same way down the patch.
        const forward = pass % 2 === 0;

        for (let step = 0; step < targets.length; step += 1) {
            const index = targets[forward ? step : targets.length - 1 - step] ?? 0;
            const x = index % width;
            const y = (index - x) / width;
            let count = 0;
            let red = 0;
            let green = 0;
            let blue = 0;

            for (const [dx, dy] of ORTHOGONAL) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }

                const offset = (ny * width + nx) * 3;

                red += work[offset] ?? 0;
                green += work[offset + 1] ?? 0;
                blue += work[offset + 2] ?? 0;
                count += 1;
            }

            if (count === 0) {
                continue;
            }

            const offset = index * 3;

            work[offset] = red / count;
            work[offset + 1] = green / count;
            work[offset + 2] = blue / count;
        }
    }
}

/**
 * Takes a known overlay back out of a frame, then rebuilds only what is left.
 *
 * A watermark is not a hole. It is `o = (1 − a)·b + a·W` — the footage `b`, still
 * there, with white `W` laid over it at strength `a`. Where `a` is known and not
 * too near 1, `b = (o − a·W) / (1 − a)` gives the footage back exactly, texture,
 * grain and all. That is the difference between a corner that looks unmarked and
 * a corner that looks wiped: an inpaint invents a smooth surface, while this
 * recovers what was actually filmed.
 *
 * Only the small solid core, where the division stops being stable, is inpainted
 * — and it is inpainted *after* the un-blend, so the border it reads its answer
 * off is already clean footage rather than glow.
 *
 * Mutates `pixels` in place. Alpha is never touched.
 */
export function removeOverlay(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    alpha: Float32Array,
    opaque: Uint8Array,
): void {
    for (let index = 0; index < alpha.length; index += 1) {
        const strength = alpha[index] ?? 0;

        if (strength <= ALPHA_FLOOR || opaque[index] === 1) {
            continue;
        }

        const covered = Math.min(strength, ALPHA_OPAQUE_LIMIT);
        const remaining = 1 - covered;
        const offset = index * 4;

        for (let channel = 0; channel < 3; channel += 1) {
            const observed = pixels[offset + channel] ?? 0;

            // `Uint8ClampedArray` rounds and clamps on assignment, which is
            // exactly the right behaviour here: an estimate a shade too high
            // would otherwise wrap to black.
            pixels[offset + channel] = (observed - covered * WATERMARK_COLOR) / remaining;
        }
    }

    inpaintRegion(pixels, width, height, opaque);
}
