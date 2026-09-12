import type { PixelSize } from "@/modules/tools/types";

import { smoothHeights } from "./heightfield";

/**
 * Turning a cut-out into a shape that has a front and a back.
 *
 * A heightfield laid on a plate is a relief — one height per point, and nothing
 * behind it. Inflation is the other thing you can do with a silhouette, and it
 * is what makes the difference between a plaque of a mouse and a mouse-shaped
 * solid: every point is pushed out by how *far inside the outline* it sits, so
 * the middle bulges and the edge closes. Mirror that behind and the two halves
 * meet exactly at the outline, which is a closed body with no walls to build.
 *
 * It is still not reconstruction. Nothing here knows what the back of the
 * subject looks like, because a photograph does not say — what it knows is the
 * outline, and an inflated outline is the honest solid that follows from it.
 */

/** Alpha above this counts as subject. Half-transparent edges land outside. */
export const SILHOUETTE_ALPHA = 0.5;

/** Blur passes over the bulge before the outline is put back to zero. */
export const SILHOUETTE_SMOOTHING_PASSES = 3;

/**
 * How many relaxation sweeps the inflation runs, per grid edge.
 *
 * Successive over-relaxation on an N-wide grid needs on the order of N sweeps
 * to settle at its optimal factor, and two per edge leaves a comfortable margin
 * on the shapes here. At the largest grid this is a few hundred million cell
 * updates — a fraction of a second, once per picture.
 */
const SWEEPS_PER_EDGE = 2;

export type Silhouette = {
    /** 1 where the subject is, 0 elsewhere. */
    readonly inside: Uint8Array;
    /** How far each point sits inside the outline, 0 outside, 1 at the deepest. */
    readonly depth: Float32Array;
    /** False when nothing was inside — a fully transparent picture. */
    readonly present: boolean;
};

/**
 * The inflation field: how much every inside point stands proud of the outline.
 *
 * Solves Poisson's equation ∇²h = −1 inside the outline with h = 0 on it, by
 * successive over-relaxation. That particular equation is the one whose answer
 * is the right shape: on a disc it is a paraboloid, on a strip a parabolic
 * arch, and the square root of either is an exact hemisphere or half-cylinder.
 * Narrow parts come out low and wide parts high — an ear thinner than a head,
 * a leg thinner than a body — which is what an inflated outline should do and
 * what a distance transform cannot: distance rises at the same rate everywhere
 * and so peaks in a sharp ridge down the middle of anything long.
 *
 * Beyond the grid is *not* outside. A subject that runs off the edge of the
 * frame — a portrait cropped at the chest — continues past it, so the edge is
 * a mirror (zero gradient) rather than a zero. The body keeps its thickness up
 * to the frame and the mesh builder caps the open edge with a flat wall — the
 * cut a bust has, rather than a taper to nothing.
 *
 * Returned normalised to 0..1 against the highest point.
 */
export function inflationField(inside: Uint8Array, grid: PixelSize): Float32Array {
    const { width, height } = grid;
    const field = new Float32Array(width * height);
    const sweeps = Math.ceil(SWEEPS_PER_EDGE * Math.max(width, height));
    // The optimal over-relaxation factor for Poisson on a grid of this size.
    const omega = 2 / (1 + Math.sin(Math.PI / (Math.max(width, height) + 1)));

    const at = (column: number, row: number, self: number) =>
        column < 0 || row < 0 || column >= width || row >= height
            ? self
            : field[row * width + column];

    for (let sweep = 0; sweep < sweeps; sweep += 1) {
        for (let row = 0; row < height; row += 1) {
            for (let column = 0; column < width; column += 1) {
                const index = row * width + column;

                if (inside[index] === 0) {
                    continue;
                }

                const self = field[index];
                const neighbours =
                    at(column - 1, row, self) +
                    at(column + 1, row, self) +
                    at(column, row - 1, self) +
                    at(column, row + 1, self);

                field[index] = self + omega * ((neighbours + 1) / 4 - self);
            }
        }
    }

    let highest = 0;

    for (const value of field) {
        highest = Math.max(highest, value);
    }

    if (highest > 0) {
        for (let index = 0; index < field.length; index += 1) {
            field[index] /= highest;
        }
    }

    return field;
}

/**
 * The silhouette, and how far every point of it stands proud.
 *
 * The square root of the inflation field, which turns its parabolic sections
 * into circular ones — the profile of a body rather than of a tent.
 */
export function buildSilhouette(alpha: Float32Array, grid: PixelSize): Silhouette {
    const inside = new Uint8Array(alpha.length);
    let any = false;

    for (let index = 0; index < alpha.length; index += 1) {
        const solid = alpha[index] >= SILHOUETTE_ALPHA ? 1 : 0;

        inside[index] = solid;
        any = any || solid === 1;
    }

    const depth = new Float32Array(alpha.length);

    if (!any) {
        return { inside, depth, present: false };
    }

    const field = inflationField(inside, grid);

    for (let index = 0; index < field.length; index += 1) {
        depth[index] = Math.sqrt(field[index]);
    }

    // The circular profile is right for a body and wrong for a grid: on a
    // 100 mm model it climbs two millimetres inside the first half-millimetre
    // cell, which turns the outline's staircase into a cliff with teeth. Two
    // things bring it down to something a surface would do, in this order. The
    // box-averaged alpha, which is fractional where a cell straddles the
    // outline, scales the first ring so a cell a third inside stands a third as
    // high — and *then* the bulge is blurred, which rounds that ring against the
    // zeros beside it and, because the blur runs after the ramp, smooths the
    // ramp's own cell-to-cell alternation rather than leaving a beaded equator.
    // The outline is then put back to exactly zero, because closure depends on
    // it.
    for (let index = 0; index < depth.length; index += 1) {
        const coverage = Math.min(
            1,
            Math.max(0, (alpha[index] - SILHOUETTE_ALPHA) / SILHOUETTE_ALPHA),
        );

        depth[index] *= coverage;
    }

    const softened = smoothHeights(depth, grid, SILHOUETTE_SMOOTHING_PASSES);

    for (let index = 0; index < softened.length; index += 1) {
        if (inside[index] === 0) {
            softened[index] = 0;
        }
    }

    return { inside, depth: softened, present: true };
}

/**
 * The front half's height at one point: the bulge, with the picture's own
 * relief allowed to modulate a share of it.
 *
 * The relief is multiplied *into* the bulge rather than added to it, which is
 * the one thing that has to be true here: added, it would lift the outline off
 * zero and the two halves would no longer meet. Multiplied, everything the
 * detail control does still vanishes exactly where the bulge does.
 */
export function inflatedHeight(bulge: number, relief: number, detail: number): number {
    return bulge * (1 - detail + detail * relief);
}
