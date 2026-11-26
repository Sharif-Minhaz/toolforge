import { describe, expect, test } from "bun:test";

import {
    MAX_WINDOW_FRAMES,
    MEASUREMENT_WINDOW_MS,
    MIN_INTERVALS,
    WARMUP_FRAMES,
} from "@/modules/refresh-rate-tester/domain/constants";
import {
    createFrameRecorder,
    nearestRefreshRate,
    readFrames,
    recordFrame,
    summarizeFrames,
} from "@/modules/refresh-rate-tester/domain/frames";

/** Frame times of a display refreshing at `hz`, optionally with some refreshes missed. */
function frames(hz: number, count: number, missed: ReadonlySet<number> = new Set()): number[] {
    return Array.from({ length: count }, (_, index) => index)
        .filter((index) => !missed.has(index))
        .map((index) => 1000 + (index * 1000) / hz);
}

describe("summarizeFrames", () => {
    test("reads a steady 60 Hz display", () => {
        const summary = summarizeFrames(frames(60, 300));

        expect(summary?.hz).toBeCloseTo(60, 6);
        expect(summary?.nearestRate).toBe(60);
        expect(summary?.droppedFrames).toBe(0);
        expect(summary?.jitterMs).toBeCloseTo(0, 6);
        expect(summary?.medianIntervalMs).toBeCloseTo(16.667, 3);
    });

    test("reads 144 Hz through a clock rounded to the millisecond", () => {
        // The trap: the intervals arrive as 6s and 7s, and the median alone
        // would read 1000 / 7 = 142.9 Hz.
        const summary = summarizeFrames(frames(144, 600).map(Math.round));

        expect(summary?.medianIntervalMs).toBe(7);
        expect(summary?.hz).toBeCloseTo(144, 1);
        expect(summary?.nearestRate).toBe(144);
        expect(summary?.droppedFrames).toBe(0);
    });

    test("counts missed refreshes without slowing the reading", () => {
        // One refresh missed three times, then two in a row.
        const summary = summarizeFrames(frames(120, 400, new Set([100, 200, 300, 301])));

        expect(summary?.droppedFrames).toBe(4);
        expect(summary?.hz).toBeCloseTo(120, 6);
        // Drops are not jitter: the on-time frames are perfectly even.
        expect(summary?.jitterMs).toBeCloseTo(0, 6);
    });

    test("counts drops at 360 Hz through a rounded clock", () => {
        const summary = summarizeFrames(
            frames(360, 1500, new Set([400, 900, 901])).map(Math.round),
        );

        expect(summary?.droppedFrames).toBe(3);
        expect(summary?.hz).toBeCloseTo(360, 0);
        expect(summary?.nearestRate).toBe(360);
    });

    test("reports jitter as the spread of on-time frame times", () => {
        const uneven = frames(60, 301).map((time, index) => time + (index % 2) * 0.5);
        const summary = summarizeFrames(uneven);

        expect(summary?.jitterMs).toBeCloseTo(0.5, 6);
        expect(summary?.nearestRate).toBe(60);
    });

    test("ignores two frames the clock could not tell apart", () => {
        const doubled = frames(60, 200).flatMap((time) => [time, time]);

        expect(summarizeFrames(doubled)?.hz).toBeCloseTo(60, 6);
        expect(summarizeFrames(doubled)?.intervals).toBe(199);
    });

    test("waits for enough intervals", () => {
        expect(summarizeFrames(frames(60, MIN_INTERVALS))).toBeNull();
        expect(summarizeFrames(frames(60, MIN_INTERVALS + 1))).not.toBeNull();
        expect(summarizeFrames([])).toBeNull();
    });
});

describe("nearestRefreshRate", () => {
    test("names the common rate a reading sits on", () => {
        expect(nearestRefreshRate(59.94)).toBe(60);
        expect(nearestRefreshRate(29.97)).toBe(30);
        expect(nearestRefreshRate(143.86)).toBe(144);
        expect(nearestRefreshRate(164.8)).toBe(165);
        expect(nearestRefreshRate(239.76)).toBe(240);
        expect(nearestRefreshRate(359)).toBe(360);
    });

    test("names none for a reading between rates", () => {
        expect(nearestRefreshRate(110)).toBeNull();
        expect(nearestRefreshRate(40)).toBeNull();
        expect(nearestRefreshRate(1000)).toBeNull();
    });
});

describe("recordFrame and readFrames", () => {
    test("discards the warm-up frames", () => {
        const recorder = createFrameRecorder();

        for (const time of frames(60, WARMUP_FRAMES)) {
            recordFrame(recorder, time);
        }

        expect(recorder.timestamps).toEqual([]);
        expect(readFrames(recorder)).toEqual({ status: "warming_up" });

        recordFrame(recorder, 5000);

        expect(recorder.timestamps).toEqual([5000]);
        expect(readFrames(recorder)).toEqual({ status: "collecting" });
    });

    test("is ready once enough frames follow the warm-up", () => {
        const recorder = createFrameRecorder();

        for (const time of frames(144, WARMUP_FRAMES + MIN_INTERVALS + 1)) {
            recordFrame(recorder, time);
        }

        const reading = readFrames(recorder);

        expect(reading.status).toBe("ready");
        expect(reading.status === "ready" && reading.summary.nearestRate).toBe(144);
    });

    test("keeps only the most recent window", () => {
        const recorder = createFrameRecorder();

        // 50 Hz, so the frame exactly one window back lands on a whole number.
        for (const time of frames(50, 600)) {
            recordFrame(recorder, time);
        }

        const kept = recorder.timestamps;
        const latest = kept[kept.length - 1];

        expect(kept[0]).toBeGreaterThanOrEqual(latest - MEASUREMENT_WINDOW_MS);
        expect(kept.length).toBe(251);
    });

    test("holds no more than the frame ceiling, whatever the clock says", () => {
        const recorder = createFrameRecorder();

        for (const time of frames(2000, 12_000)) {
            recordFrame(recorder, time);
        }

        expect(recorder.timestamps.length).toBe(MAX_WINDOW_FRAMES);
    });
});
