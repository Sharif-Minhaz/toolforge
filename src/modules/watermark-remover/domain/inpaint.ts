import {
    ALPHA_FLOOR,
    ALPHA_UNBLEND_MAX,
    FILL_BORDER_ALPHA,
    INPAINT_OVER_RELAXATION,
    INPAINT_RELAX_ITERATIONS,
    INPAINT_RELAX_PER_PIXEL,
    INPAINT_SETTLED,
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

/**
 * Sweeps until the patch stops moving, or until the budget runs out.
 *
 * The iteration count is sized for the worst case — a hole as wide as the mark,
 * over-relaxed, needs about its own width in sweeps — and the worst case is not
 * the common one. A small hole over a flat corner is finished in a tenth of
 * that, and the remaining sweeps are pure cost repeated on every frame of the
 * clip. Stopping when no pixel has moved by a quarter of a level is the same
 * answer for a fraction of the work.
 */
function relax(
    work: Float32Array,
    width: number,
    height: number,
    targets: readonly number[],
    iterations: number,
): void {
    for (let pass = 0; pass < iterations; pass += 1) {
        let movement = 0;

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

            // Over-relaxed: each channel is moved *past* the neighbour average
            // rather than onto it. Landing on the average converges on the true
            // surface in about the square of the hole's width; overshooting does
            // it in about the width. On a hole a hundred pixels across that is
            // the difference between an answer and a sag.
            const stepRed = INPAINT_OVER_RELAXATION * (red / count - (work[offset] ?? 0));
            const stepGreen = INPAINT_OVER_RELAXATION * (green / count - (work[offset + 1] ?? 0));
            const stepBlue = INPAINT_OVER_RELAXATION * (blue / count - (work[offset + 2] ?? 0));

            work[offset] += stepRed;
            work[offset + 1] += stepGreen;
            work[offset + 2] += stepBlue;

            movement = Math.max(
                movement,
                Math.abs(stepRed),
                Math.abs(stepGreen),
                Math.abs(stepBlue),
            );
        }

        if (movement < INPAINT_SETTLED) {
            return;
        }
    }
}

/**
 * The region the rebuild is interpolated across — which is deliberately larger
 * than the region it is allowed to change.
 *
 * A fill takes its answer from the pixels bordering its hole, so those pixels
 * decide the result. Bordering the hole on the un-blended footage sounds right
 * and is not, because the un-blend divides by `1 − a`: at the half-covered
 * contour where the rebuild used to start, every error in the opacity comes back
 * doubled. Measured on a corner whose footage is saturated brown, an opacity
 * three per cent low there desaturated the border by fifteen levels — and the
 * fill then carried that faithfully into the middle, which is the grey patch in
 * the shape of the mark that a reader sees and calls a defect.
 *
 * Note what that means: the fill was never the problem. A perfect fill of the
 * true footage over the same hole is within one level of the truth on a smooth
 * corner and ten on a honeycomb; the tool was at fifteen and twenty-two. **The
 * fill was accurate. What it was accurate about was wrong.**
 *
 * So the hole runs out to where the mark is faint enough that the un-blend is
 * trustworthy, and the *weight* — how much of the fill is actually used — stays
 * the narrow ramp it was. The extra ring is interpolated and then almost
 * entirely thrown away; what it buys is a border made of footage.
 */
export function rebuildHoles(alpha: Float32Array, rebuild: Float32Array): Uint8Array {
    return Uint8Array.from(alpha, (value, index) =>
        value > FILL_BORDER_ALPHA || (rebuild[index] ?? 0) > 0 ? 1 : 0,
    );
}

/**
 * Takes a known overlay back out of a frame, then rebuilds the part that is left.
 *
 * A watermark is not a hole. It is `o = (1 − a)·b + a·W` — the footage `b`, still
 * there, with white `W` laid over it at strength `a`. Where `a` is known and
 * modest, `b = (o − a·W) / (1 − a)` gives the footage back exactly: texture,
 * grain and all. That is the difference between a corner that looks unmarked and
 * a corner that looks wiped.
 *
 * But that division has a cost that grows with `a`. It multiplies every error in
 * the observed pixel by `1/(1 − a)`, and a compressed frame is made of small
 * errors — so the opacity can be perfect and the result still comes back
 * visibly grainier than the picture around it, in exactly the shape of the mark.
 * Past about half covered, what is being recovered is mostly amplified noise.
 *
 * So there are two answers and the pixel's own opacity chooses between them:
 * recover it where the mark is thin, rebuild it from its surroundings where the
 * mark is thick, and **cross-fade across the middle**. A hard line between the
 * two would be an edge drawn along a contour of the mark, which is the artefact
 * again in a different colour.
 *
 * Mutates `pixels` in place. Alpha is never touched.
 */
export function removeOverlay(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    alpha: Float32Array,
    rebuild: Float32Array,
    passes: number = INPAINT_RELAX_ITERATIONS,
    halo: Float32Array = EMPTY_HALO,
): void {
    const original = Uint8ClampedArray.from(pixels);

    for (let index = 0; index < alpha.length; index += 1) {
        const strength = alpha[index] ?? 0;

        if (strength <= ALPHA_FLOOR) {
            continue;
        }

        const offset = index * 4;

        // What is physically possible, before what was estimated.
        //
        // White was *added* to this pixel, so the footage under it was darker
        // than what is here now — never negative. That bounds the opacity from
        // below the pixel itself: `a` can be at most `observed / 255` in every
        // channel, or the arithmetic is claiming light was removed that was
        // never there. An estimate over that line is the difference between a
        // repaired corner and a dark, faintly coloured blotch.
        let possible = 1;

        for (let channel = 0; channel < 3; channel += 1) {
            possible = Math.min(possible, (pixels[offset + channel] ?? 0) / WATERMARK_COLOR);
        }

        const covered = Math.min(strength, ALPHA_UNBLEND_MAX, possible);

        if (covered <= ALPHA_FLOOR) {
            continue;
        }

        const remaining = 1 - covered;

        for (let channel = 0; channel < 3; channel += 1) {
            const observed = pixels[offset + channel] ?? 0;

            // `Uint8ClampedArray` rounds and clamps on assignment, which is the
            // right behaviour for the rounding left over after the bound above.
            pixels[offset + channel] = (observed - covered * WATERMARK_COLOR) / remaining;
        }
    }

    // The rebuild happens on a copy so both answers exist at once and can be
    // faded together. Its boundary is the un-blended footage above, not the
    // mark — so what it reads from is clean.
    const rebuilt = Uint8ClampedArray.from(pixels);

    inpaintRegion(rebuilt, width, height, rebuildHoles(alpha, rebuild), passes);

    for (let index = 0; index < rebuild.length; index += 1) {
        const weight = Math.min(1, Math.max(0, rebuild[index] ?? 0));

        if (weight <= 0) {
            continue;
        }

        const offset = index * 4;

        for (let channel = 0; channel < 3; channel += 1) {
            const recovered = pixels[offset + channel] ?? 0;
            const invented = rebuilt[offset + channel] ?? 0;
            const blended = recovered + weight * (invented - recovered);

            // Taking white back out of a pixel can only make it darker. Never
            // brighter — there is no arrangement of footage and overlay for
            // which removing the overlay adds light.
            //
            // The un-blend obeys that on its own: `(o − aW)/(1 − a) ≤ o` for
            // every `o ≤ W`. The rebuild does not, because a fill answers to its
            // neighbours rather than to the pixel it is replacing, and on a
            // frame where a flare crosses the mark it invented a patch **42
            // levels brighter** than what was there — a bright blob, on the one
            // frame in the clip where the eye is already looking.
            //
            // An estimator can be improved. An invariant cannot be violated, and
            // costs one comparison to enforce.
            pixels[offset + channel] = Math.min(blended, original[offset + channel] ?? 0);
        }
    }

    // The mark's dark half, last and on its own terms.
    //
    // Deliberately after the invariant above rather than inside it. That rule —
    // taking white out can only darken — is a statement about the un-blend, and
    // it is exactly true there. This is the opposite correction on a disjoint
    // set of pixels: a measured dark ring, added back. Folding the two together
    // would let each one's guard forbid the other's job.
    for (let index = 0; index < alpha.length; index += 1) {
        const offset = index * 4;

        for (let channel = 0; channel < 3; channel += 1) {
            const lift = halo[index * 3 + channel] ?? 0;

            if (lift === 0) {
                continue;
            }

            pixels[offset + channel] = (pixels[offset + channel] ?? 0) - lift;
        }
    }
}

/** No dark half measured, for callers that do not have one. */
const EMPTY_HALO = new Float32Array(0);
