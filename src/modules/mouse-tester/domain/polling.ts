import {
    MIN_POLLING_INTERVALS,
    POLLING_CLASS_TOLERANCE_OCTAVES,
    POLLING_MOVE_GAP_MS,
    STANDARD_POLLING_RATES,
} from "./constants";
import type { PollingSummary } from "../types";

/**
 * A polling rate from pointer sample timestamps.
 *
 * The timestamps are what makes this honest. A browser delivers `pointermove`
 * once per frame, so counting events measures the display — 60, 120, 144 —
 * whatever the mouse is doing; that is why so many testers report a 1000 Hz
 * mouse as 144. Every report the mouse sent in between is still there, in
 * `getCoalescedEvents()`, each with its own timestamp. The intervals between
 * those are the mouse's.
 *
 * The median, not the mean, decides the rate: one stall while the hand turns
 * round, or a burst the operating system delivered late, moves a mean a long
 * way and a median not at all.
 */
export function summarizePolling(timestamps: readonly number[]): PollingSummary | null {
    const intervals: number[] = [];

    for (let index = 1; index < timestamps.length; index += 1) {
        const interval = timestamps[index] - timestamps[index - 1];

        // Zero is two samples the clock could not tell apart, and a long gap
        // is a mouse that stopped. Neither is an interval the mouse chose.
        if (interval > 0 && interval <= POLLING_MOVE_GAP_MS) {
            intervals.push(interval);
        }
    }

    if (intervals.length < MIN_POLLING_INTERVALS) {
        return null;
    }

    const sorted = intervals.toSorted((a, b) => a - b);
    const middle = sorted.length >> 1;
    const median =
        sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const variance =
        intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
    const medianHz = 1000 / median;

    return {
        medianHz,
        averageHz: 1000 / mean,
        jitterPercent: (Math.sqrt(variance) / mean) * 100,
        rateClass: nearestPollingRate(medianHz),
        samples: intervals.length,
    };
}

/**
 * The standard rate a measurement belongs to, compared in octaves because the
 * rates double: 900 Hz is a 1000 Hz mouse, and 700 Hz is not obviously either.
 */
export function nearestPollingRate(hz: number): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;

    for (const rate of STANDARD_POLLING_RATES) {
        const distance = Math.abs(Math.log2(hz / rate));

        if (distance < bestDistance) {
            best = rate;
            bestDistance = distance;
        }
    }

    return bestDistance <= POLLING_CLASS_TOLERANCE_OCTAVES ? best : null;
}
