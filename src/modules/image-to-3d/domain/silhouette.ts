import type { PixelSize } from "@/modules/tools/types";

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

/**
 * Chamfer weights for the distance transform below.
 *
 * 3 and 4 rather than 1 and √2. The classic integer approximation: two passes
 * over the grid with these weights are within about 8% of true Euclidean
 * distance, which is far finer than the grid the distance is measured on — and
 * an exact transform would be several times the code for a difference no
 * geometry here can express.
 */
const STEP_ORTHOGONAL = 3;
const STEP_DIAGONAL = 4;

/** Larger than any path across a grid this size, and safe to add to. */
const UNREACHABLE = 1 << 28;

export type Silhouette = {
    /** 1 where the subject is, 0 elsewhere. */
    readonly inside: Uint8Array;
    /** How far each point sits inside the outline, 0 outside, 1 at the deepest. */
    readonly depth: Float32Array;
    /** False when nothing was inside — a fully transparent picture. */
    readonly present: boolean;
};

/**
 * Distance from every inside point to the nearest outside point.
 *
 * Two raster passes, forward then backward, which is the whole algorithm: after
 * the forward pass each cell knows the shortest path that arrives from above or
 * the left, and after the backward pass it knows the shortest overall. Points
 * outside stay at zero, which is what makes the inflation vanish exactly at the
 * outline rather than a cell short of it.
 *
 * The border of the grid counts as outside whether or not the subject reaches
 * it. A subject cropped by the frame would otherwise inflate to full height
 * against a straight edge and leave the front and back halves unable to meet.
 */
export function distanceTransform(inside: Uint8Array, grid: PixelSize): Int32Array {
    const { width, height } = grid;
    const distance = new Int32Array(width * height);

    for (let index = 0; index < distance.length; index += 1) {
        distance[index] = inside[index] === 1 ? UNREACHABLE : 0;
    }

    const at = (column: number, row: number) =>
        column < 0 || row < 0 || column >= width || row >= height
            ? 0
            : distance[row * width + column];

    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
            const index = row * width + column;

            if (distance[index] === 0) {
                continue;
            }

            distance[index] = Math.min(
                distance[index],
                at(column - 1, row) + STEP_ORTHOGONAL,
                at(column, row - 1) + STEP_ORTHOGONAL,
                at(column - 1, row - 1) + STEP_DIAGONAL,
                at(column + 1, row - 1) + STEP_DIAGONAL,
            );
        }
    }

    for (let row = height - 1; row >= 0; row -= 1) {
        for (let column = width - 1; column >= 0; column -= 1) {
            const index = row * width + column;

            if (distance[index] === 0) {
                continue;
            }

            distance[index] = Math.min(
                distance[index],
                at(column + 1, row) + STEP_ORTHOGONAL,
                at(column, row + 1) + STEP_ORTHOGONAL,
                at(column + 1, row + 1) + STEP_DIAGONAL,
                at(column - 1, row + 1) + STEP_DIAGONAL,
            );
        }
    }

    return distance;
}

/**
 * The silhouette, and how deep inside it every point sits.
 *
 * The profile is a circular cross-section rather than the raw distance:
 * `sqrt(u(2 − u))` is the height of a half-circle of radius 1 at a distance `u`
 * in from its edge. Using the distance itself would give a tent — flat-sided,
 * with a ridge down the middle — which reads as a folded card rather than as an
 * object. This rises steeply at the outline and flattens over the middle, which
 * is what a rounded body does.
 */
export function buildSilhouette(alpha: Float32Array, grid: PixelSize): Silhouette {
    const inside = new Uint8Array(alpha.length);
    let any = false;

    for (let index = 0; index < alpha.length; index += 1) {
        const solid = alpha[index] >= SILHOUETTE_ALPHA ? 1 : 0;

        inside[index] = solid;
        any = any || solid === 1;
    }

    // The frame itself counts as outside, whatever the picture says.
    //
    // Not a detail: closure depends on the outermost ring being at exactly zero
    // so the front and back halves land on the same points there. A subject
    // that reaches the edge — or a picture with no transparency at all, where
    // every pixel is "inside" — would otherwise stand a full bulge high against
    // a straight wall, and the two halves would never meet along it. Clipping
    // the ring is also what a subject cropped by the frame should do: it ends at
    // the frame rather than being inflated past it.
    for (let column = 0; column < grid.width; column += 1) {
        inside[column] = 0;
        inside[(grid.height - 1) * grid.width + column] = 0;
    }

    for (let row = 0; row < grid.height; row += 1) {
        inside[row * grid.width] = 0;
        inside[row * grid.width + grid.width - 1] = 0;
    }

    const depth = new Float32Array(alpha.length);

    if (!any) {
        return { inside, depth, present: false };
    }

    const distance = distanceTransform(inside, grid);
    let deepest = 0;

    for (const value of distance) {
        deepest = Math.max(deepest, value);
    }

    if (deepest === 0) {
        return { inside, depth, present: true };
    }

    for (let index = 0; index < distance.length; index += 1) {
        const ratio = Math.min(1, distance[index] / deepest);

        depth[index] = Math.sqrt(ratio * (2 - ratio));
    }

    return { inside, depth, present: true };
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
