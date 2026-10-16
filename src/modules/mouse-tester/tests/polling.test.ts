import { describe, expect, test } from "bun:test";

import { MIN_POLLING_INTERVALS } from "@/modules/mouse-tester/domain/constants";
import { nearestPollingRate, summarizePolling } from "@/modules/mouse-tester/domain/polling";

function samples(intervalMs: number, count: number, start = 0): number[] {
    return Array.from({ length: count }, (_, index) => start + index * intervalMs);
}

describe("summarizePolling", () => {
    test("reads a steady 1000 Hz stream", () => {
        const summary = summarizePolling(samples(1, 300));

        expect(summary?.medianHz).toBeCloseTo(1000);
        expect(summary?.rateClass).toBe(1000);
        expect(summary?.jitterPercent).toBeCloseTo(0);
    });

    test("is not dragged by a stall or by duplicate timestamps", () => {
        const stream = [...samples(2, 200), 2000, ...samples(2, 200, 2000), 2398];
        const summary = summarizePolling(stream);

        expect(summary?.medianHz).toBeCloseTo(500);
        expect(summary?.rateClass).toBe(500);
    });

    test("waits for enough movement", () => {
        expect(summarizePolling(samples(1, MIN_POLLING_INTERVALS))).toBeNull();
        expect(summarizePolling(samples(1, MIN_POLLING_INTERVALS + 1))).not.toBeNull();
    });

    test("reports jitter as a share of the mean interval", () => {
        const alternating = Array.from(
            { length: 201 },
            (_, index) => index * 1 + (index % 2) * 0.5,
        );
        const summary = summarizePolling(alternating);

        expect(summary?.jitterPercent).toBeCloseTo(50);
    });
});

describe("nearestPollingRate", () => {
    test("snaps within a third of an octave and refuses between", () => {
        expect(nearestPollingRate(905)).toBe(1000);
        expect(nearestPollingRate(7600)).toBe(8000);
        expect(nearestPollingRate(130)).toBe(125);
        expect(nearestPollingRate(700)).toBeNull();
        expect(nearestPollingRate(60)).toBeNull();
    });
});
