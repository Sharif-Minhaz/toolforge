import {
    COMMON_REFRESH_RATES,
    MAX_WINDOW_FRAMES,
    MEASUREMENT_WINDOW_MS,
    MIN_INTERVALS,
    NEAREST_RATE_TOLERANCE,
    WARMUP_FRAMES,
} from "./constants";
import type { FrameReading, FrameSummary } from "../types";

/**
 * The frame timestamps of one measurement. Mutable on purpose: a frame arrives
 * up to several hundred times a second, and copying the window on each one
 * would cost more than the measurement it serves.
 */
export type FrameRecorder = {
    /** Every frame seen since the recorder was made, warm-up included. */
    seen: number;
    readonly timestamps: number[];
};

export function createFrameRecorder(): FrameRecorder {
    return { seen: 0, timestamps: [] };
}

/** Records one `requestAnimationFrame` timestamp: warm-up frames are dropped, and so is anything older than the window. */
export function recordFrame(recorder: FrameRecorder, timestamp: number): void {
    recorder.seen += 1;

    if (recorder.seen <= WARMUP_FRAMES) {
        return;
    }

    const { timestamps } = recorder;
    timestamps.push(timestamp);

    let stale = 0;

    while (stale < timestamps.length && timestamps[stale] < timestamp - MEASUREMENT_WINDOW_MS) {
        stale += 1;
    }

    stale = Math.max(stale, timestamps.length - MAX_WINDOW_FRAMES);

    if (stale > 0) {
        timestamps.splice(0, stale);
    }
}

export function readFrames(recorder: FrameRecorder): FrameReading {
    if (recorder.seen <= WARMUP_FRAMES) {
        return { status: "warming_up" };
    }

    const summary = summarizeFrames(recorder.timestamps);

    return summary === null ? { status: "collecting" } : { status: "ready", summary };
}

/**
 * The display's rate from frame timestamps.
 *
 * The median interval is the refresh period, because one long frame moves a
 * mean a long way and a median not at all. It is not the reading, though:
 * browsers that coarsen their clocks against timing attacks hand out frame
 * times rounded to the millisecond, so a 144 Hz screen's 6.94 ms intervals
 * arrive as mostly 7 and the median says 142.9.
 * Instead each interval is rounded to the number of refreshes it spans, and
 * the reading is refreshes over the time they took — exact to the clock's
 * rounding over the whole window, and untouched by a dropped frame, which
 * simply counts as two refreshes.
 */
export function summarizeFrames(timestamps: readonly number[]): FrameSummary | null {
    const intervals: number[] = [];

    for (let index = 1; index < timestamps.length; index += 1) {
        const interval = timestamps[index] - timestamps[index - 1];

        // Two frames the clock could not tell apart are not an interval.
        if (interval > 0) {
            intervals.push(interval);
        }
    }

    if (intervals.length < MIN_INTERVALS) {
        return null;
    }

    const median = medianOf(intervals);
    const onTime: number[] = [];
    let refreshes = 0;
    let span = 0;
    let droppedFrames = 0;

    for (const interval of intervals) {
        const spanned = Math.max(1, Math.round(interval / median));

        refreshes += spanned;
        span += interval;
        droppedFrames += spanned - 1;

        if (spanned === 1) {
            onTime.push(interval);
        }
    }

    const hz = (refreshes * 1000) / span;

    return {
        hz,
        medianIntervalMs: median,
        // Over on-time frames only, so a dropped frame is counted once, as a
        // drop, rather than again as a burst of jitter.
        jitterMs: standardDeviation(onTime),
        droppedFrames,
        intervals: intervals.length,
        nearestRate: nearestRefreshRate(hz),
    };
}

/** The common rate a reading belongs to, compared by ratio: 3% of 60 Hz is not 3% of 240. */
export function nearestRefreshRate(hz: number): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;

    for (const rate of COMMON_REFRESH_RATES) {
        const distance = Math.abs(hz - rate) / rate;

        if (distance < bestDistance) {
            best = rate;
            bestDistance = distance;
        }
    }

    return bestDistance <= NEAREST_RATE_TOLERANCE ? best : null;
}

function medianOf(values: readonly number[]): number {
    const sorted = values.toSorted((a, b) => a - b);
    const middle = sorted.length >> 1;

    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function standardDeviation(values: readonly number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}
