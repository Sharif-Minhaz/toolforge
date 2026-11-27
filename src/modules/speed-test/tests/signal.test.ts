import { describe, expect, test } from "bun:test";

import {
    approach,
    flowFor,
    streamPace,
    throughputLevel,
    tracePaths,
} from "@/modules/speed-test/domain/signal";

const MBPS = 1_000_000;

describe("throughputLevel", () => {
    test("nothing measured is a still link", () => {
        expect(throughputLevel(null)).toBe(0);
        expect(throughputLevel(undefined)).toBe(0);
        expect(throughputLevel(0)).toBe(0);
        expect(throughputLevel(-5)).toBe(0);
        expect(throughputLevel(Number.NaN)).toBe(0);
    });

    test("rises with the rate and never falls", () => {
        const rates = [0.5, 1, 5, 10, 50, 100, 500, 1000].map((mbps) => mbps * MBPS);
        const levels = rates.map(throughputLevel);

        levels.slice(1).forEach((level, index) => {
            expect(level).toBeGreaterThan(levels[index] ?? 0);
        });
    });

    test("is a log scale: 10 Mbps a third of the way to 1 Gbps, 100 Mbps two thirds", () => {
        expect(throughputLevel(10 * MBPS)).toBeCloseTo(0.347, 2);
        expect(throughputLevel(100 * MBPS)).toBeCloseTo(0.668, 2);
    });

    test("stops at the ceiling", () => {
        expect(throughputLevel(1000 * MBPS)).toBe(1);
        expect(throughputLevel(10_000 * MBPS)).toBe(1);
    });
});

describe("flowFor", () => {
    test("no phase is still", () => {
        expect(flowFor(null, 50 * MBPS)).toEqual({ mode: "still" });
    });

    test("the round-trip phase pings", () => {
        expect(flowFor("latency", null)).toEqual({ mode: "ping" });
    });

    test("a download streams toward the reader, an upload away", () => {
        expect(flowFor("download", 100 * MBPS)).toMatchObject({ mode: "stream", direction: "in" });
        expect(flowFor("upload", 100 * MBPS)).toMatchObject({ mode: "stream", direction: "out" });
    });
});

describe("streamPace", () => {
    test("a slow line still moves something", () => {
        const pace = streamPace(0);

        expect(pace.spawnPerSecond).toBeGreaterThan(0);
        expect(pace.travelPerSecond).toBeGreaterThan(0);
    });

    test("a faster line sends more, quicker, longer packets", () => {
        const slow = streamPace(0.2);
        const fast = streamPace(0.9);

        expect(fast.spawnPerSecond).toBeGreaterThan(slow.spawnPerSecond);
        expect(fast.travelPerSecond).toBeGreaterThan(slow.travelPerSecond);
        expect(fast.streak).toBeGreaterThan(slow.streak);
    });

    test("clamps a level outside 0–1", () => {
        expect(streamPace(4)).toEqual(streamPace(1));
        expect(streamPace(-1)).toEqual(streamPace(0));
    });
});

describe("approach", () => {
    test("covers half the gap in one half-life", () => {
        expect(approach(0, 100, 200, 200)).toBeCloseTo(50, 6);
        expect(approach(0, 100, 400, 200)).toBeCloseTo(75, 6);
    });

    test("does not move without time passing", () => {
        expect(approach(10, 100, 0, 200)).toBe(10);
    });

    test("jumps when there is no easing to do", () => {
        expect(approach(10, 100, 16, 0)).toBe(100);
    });
});

describe("tracePaths", () => {
    test("needs two samples to draw a line", () => {
        expect(tracePaths([], 100, 40)).toBeNull();
        expect(tracePaths([5], 100, 40)).toBeNull();
        expect(tracePaths([0, 0], 100, 40)).toBeNull();
    });

    test("spans the width and puts the largest sample at the top", () => {
        expect(tracePaths([5, 10], 100, 40)?.line).toBe("M0,20L100,0");
    });

    test("closes the area down to the baseline", () => {
        expect(tracePaths([5, 10], 100, 40)?.area).toBe("M0,20L100,0L100,40L0,40Z");
    });

    test("a shared scale keeps a slower series below the top", () => {
        expect(tracePaths([5, 10], 100, 40, 20)?.line).toBe("M0,30L100,20");
    });

    test("drops samples that are not rates", () => {
        expect(tracePaths([5, Number.NaN, -1, 10], 100, 40)?.line).toBe("M0,20L100,0");
    });
});
