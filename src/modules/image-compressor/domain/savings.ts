import type { SavingsSummary } from "../types";

export type SizePair = {
    readonly originalBytes: number;
    readonly outputBytes: number;
};

/**
 * How much smaller the result is, as a percentage of the original.
 *
 * Signed on purpose. A lossless re-encode can come out larger, and a tool that
 * reports that as `0%` is hiding the one number the reader needed in order to
 * keep the original instead. Rounded to a whole percent because a tenth of a
 * percent of a saving is noise.
 */
export function savingsPercent(pair: SizePair): number {
    if (pair.originalBytes <= 0) {
        return 0;
    }

    return Math.round(((pair.originalBytes - pair.outputBytes) / pair.originalBytes) * 100);
}

/** Batch totals. An empty batch reports zeroes rather than dividing by none. */
export function summariseSavings(pairs: readonly SizePair[]): SavingsSummary {
    const originalBytes = pairs.reduce((total, pair) => total + pair.originalBytes, 0);
    const outputBytes = pairs.reduce((total, pair) => total + pair.outputBytes, 0);

    return {
        count: pairs.length,
        originalBytes,
        outputBytes,
        savedBytes: originalBytes - outputBytes,
        percent: savingsPercent({ originalBytes, outputBytes }),
    };
}
