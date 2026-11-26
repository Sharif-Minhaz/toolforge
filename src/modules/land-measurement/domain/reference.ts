import { REFERENCE_OBJECTS, type ReferenceComparison, type ReferenceObject } from "../types";
import { REFERENCE_SIZES } from "./constants";

export function referenceArea(object: ReferenceObject): number {
    const { length, width } = REFERENCE_SIZES[object];

    return length * width;
}

/**
 * The everyday object to compare a plot with: the largest one the plot is at
 * least as big as, so the answer is "about 3 parking spaces" rather than
 * "0.04 of a tennis court". A plot smaller than a bed is compared with a bed,
 * as a share of one — there is nothing smaller worth naming.
 */
export function chooseReference(squareMeters: number): ReferenceComparison {
    const object =
        [...REFERENCE_OBJECTS]
            .reverse()
            .find((candidate) => squareMeters >= referenceArea(candidate)) ?? REFERENCE_OBJECTS[0];

    return { object, ratio: squareMeters / referenceArea(object) };
}

/**
 * The count the sentence says and the drawing draws: one decimal under ten,
 * whole numbers above — "about 3.2", "about 14". Both read this one value, so
 * "about 2 futsal courts" is never drawn as two courts and a sliver of a third.
 */
export function roundedCount(ratio: number): number {
    return Number(ratio.toFixed(ratio < 10 ? 1 : 0));
}

/**
 * Columns to lay `tiles` objects out in so the block is as near square as it
 * can be — the plot is drawn as a square, and a block of the same shape is one
 * the eye can match against it. Two 40 × 20 m futsal courts stack into 40 × 40.
 */
export function tileColumns(tiles: number, length: number, width: number): number {
    let best = 1;
    let bestSkew = Infinity;

    for (let columns = 1; columns <= tiles; columns++) {
        const rows = Math.ceil(tiles / columns);
        const skew = Math.abs(Math.log((columns * length) / (rows * width)));

        if (skew < bestSkew) {
            best = columns;
            bestSkew = skew;
        }
    }

    return best;
}
