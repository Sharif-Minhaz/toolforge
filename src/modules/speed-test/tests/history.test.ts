import { describe, expect, test } from "bun:test";

import { MAX_KEPT_RUNS, RUNS_STORAGE_KEY } from "@/modules/speed-test/domain/constants";
import {
    forgetRuns,
    hourlyMedians,
    keepPlan,
    keepRun,
    peakSlowdown,
    readPlan,
    readRuns,
    type RunStorage,
} from "@/modules/speed-test/domain/history";
import type { SpeedRun } from "@/modules/speed-test/types";

const HOUR = 3_600_000;
const MBPS = 1_000_000;

function memoryStorage(
    initial: Record<string, string> = {},
): RunStorage & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));

    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
        removeItem: (key) => void data.delete(key),
    };
}

function run(at: number, mbps: number): SpeedRun {
    return {
        at,
        downloadBps: mbps * MBPS,
        uploadBps: null,
        latencyMs: null,
        jitterMs: null,
        loadedLatencyMs: null,
    };
}

/** Hours in UTC, so the test means the same on every machine. */
const utcHour = (at: number) => new Date(at).getUTCHours();

describe("kept runs", () => {
    test("adds newest first and caps the list", () => {
        const storage = memoryStorage();

        for (let index = 0; index < MAX_KEPT_RUNS + 5; index++) {
            keepRun(run(index, 10), storage);
        }

        const kept = readRuns(storage);

        expect(kept).toHaveLength(MAX_KEPT_RUNS);
        expect(kept[0].at).toBe(MAX_KEPT_RUNS + 4);
    });

    test("drops rows it does not understand and survives garbage", () => {
        const storage = memoryStorage({
            [RUNS_STORAGE_KEY]: JSON.stringify([run(1, 5), { at: "yesterday" }, null, run(2, 0)]),
        });

        expect(readRuns(storage)).toEqual([run(1, 5)]);
        expect(readRuns(memoryStorage({ [RUNS_STORAGE_KEY]: "{not json" }))).toEqual([]);
        expect(readRuns(undefined)).toEqual([]);
    });

    test("a full quota keeps the result on screen", () => {
        const storage: RunStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
            removeItem: () => {},
        };

        expect(keepRun(run(1, 5), storage)).toEqual([run(1, 5)]);
    });

    test("forgets on request", () => {
        const storage = memoryStorage();

        keepRun(run(1, 5), storage);
        forgetRuns(storage);

        expect(readRuns(storage)).toEqual([]);
    });
});

describe("the kept plan", () => {
    test("round-trips and clears on empty", () => {
        const storage = memoryStorage();

        keepPlan("20", storage);
        expect(readPlan(storage)).toBe("20");
        keepPlan("", storage);
        expect(readPlan(storage)).toBe("");
    });
});

describe("hourlyMedians and peakSlowdown", () => {
    const runs = [
        run(9 * HOUR, 40),
        run(9 * HOUR + 60_000, 50),
        run(9 * HOUR + 120_000, 60),
        run(21 * HOUR, 10),
        run(21 * HOUR + 60_000, 20),
        run(3 * HOUR, 99),
    ];

    test("takes the median per hour, in the zone it is handed", () => {
        const buckets = hourlyMedians(runs, utcHour);

        expect(buckets).toHaveLength(24);
        expect(buckets[9]).toEqual({ hour: 9, runs: 3, medianDownloadBps: 50 * MBPS });
        expect(buckets[21]).toEqual({ hour: 21, runs: 2, medianDownloadBps: 15 * MBPS });
        expect(buckets[4]).toEqual({ hour: 4, runs: 0, medianDownloadBps: null });
    });

    test("compares the slowest counted hour with the fastest", () => {
        // 03:00 has one run, which is not enough to count, however fast it was.
        expect(peakSlowdown(hourlyMedians(runs, utcHour))).toEqual({
            fastestHour: 9,
            slowestHour: 21,
            ratio: 0.3,
        });
    });

    test("claims nothing until two hours have enough runs", () => {
        expect(peakSlowdown(hourlyMedians(runs.slice(0, 4), utcHour))).toBeNull();
    });
});
