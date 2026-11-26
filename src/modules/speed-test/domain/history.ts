import type { HourBucket, PeakSlowdown, SpeedRun } from "../types";
import { MAX_KEPT_RUNS, MIN_RUNS_PER_HOUR, PLAN_STORAGE_KEY, RUNS_STORAGE_KEY } from "./constants";

/**
 * Past runs and the plan, kept in this browser and nowhere else — the same
 * shape as `short-links/domain/history.ts` (see
 * `docs/patterns/browser-persistence.md`): storage is a parameter with a
 * browser default, and every read degrades to what can still be read.
 */

/** The minimal surface of `Storage` this module depends on. */
export type RunStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

export function browserStorage(): RunStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        // Blocked storage throws on access, and is a supported way to browse.
        return undefined;
    }
}

const NO_RUNS: readonly SpeedRun[] = [];

function nullableNumber(value: unknown): value is number | null {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRun(value: unknown): value is SpeedRun {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const run = value as Record<string, unknown>;

    return (
        typeof run.at === "number" &&
        Number.isFinite(run.at) &&
        typeof run.downloadBps === "number" &&
        run.downloadBps > 0 &&
        nullableNumber(run.uploadBps) &&
        nullableNumber(run.latencyMs) &&
        nullableNumber(run.jitterMs) &&
        nullableNumber(run.loadedLatencyMs)
    );
}

/** Kept runs, newest first, filtered down to the rows this version understands. */
export function readRuns(storage: RunStorage | undefined = browserStorage()): readonly SpeedRun[] {
    if (!storage) {
        return NO_RUNS;
    }

    try {
        const raw = storage.getItem(RUNS_STORAGE_KEY);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);

        return Array.isArray(parsed) ? parsed.filter(isRun).slice(0, MAX_KEPT_RUNS) : NO_RUNS;
    } catch {
        return NO_RUNS;
    }
}

/** The list with `run` added at the front, capped. Returns what was written, or the input on a full quota. */
export function keepRun(
    run: SpeedRun,
    storage: RunStorage | undefined = browserStorage(),
): readonly SpeedRun[] {
    const next = [run, ...readRuns(storage)].slice(0, MAX_KEPT_RUNS);

    if (!storage) {
        return next;
    }

    try {
        storage.setItem(RUNS_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // A full quota loses the history, not the result on screen.
    }

    return next;
}

export function forgetRuns(storage: RunStorage | undefined = browserStorage()): void {
    try {
        storage?.removeItem(RUNS_STORAGE_KEY);
    } catch {
        // Nothing to do: the list was not readable either.
    }
}

export function readPlan(storage: RunStorage | undefined = browserStorage()): string {
    try {
        return storage?.getItem(PLAN_STORAGE_KEY) ?? "";
    } catch {
        return "";
    }
}

export function keepPlan(plan: string, storage: RunStorage | undefined = browserStorage()): void {
    try {
        if (plan.length === 0) {
            storage?.removeItem(PLAN_STORAGE_KEY);
        } else {
            storage?.setItem(PLAN_STORAGE_KEY, plan);
        }
    } catch {
        // Forgetting the plan costs the reader one retype.
    }
}

function median(values: readonly number[]): number | null {
    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Runs grouped by the hour of day they finished in. `hourOf` is injected
 * because the hour is the reader's own — their zone, read after hydration —
 * and a test should not depend on the zone of the machine running it.
 */
export function hourlyMedians(
    runs: readonly SpeedRun[],
    hourOf: (at: number) => number,
): HourBucket[] {
    const byHour: number[][] = Array.from({ length: 24 }, () => []);

    for (const run of runs) {
        const hour = hourOf(run.at);

        if (hour >= 0 && hour < 24) {
            byHour[hour].push(run.downloadBps);
        }
    }

    return byHour.map((speeds, hour) => ({
        hour,
        runs: speeds.length,
        medianDownloadBps: median(speeds),
    }));
}

/**
 * The slowest hour against the fastest, counting only hours with enough runs
 * to mean something. `null` until two such hours exist: one evening's bad run
 * is not a pattern, and claiming one would send a reader to argue with their
 * ISP over noise.
 */
export function peakSlowdown(buckets: readonly HourBucket[]): PeakSlowdown | null {
    const counted = buckets.filter(
        (bucket): bucket is HourBucket & { medianDownloadBps: number } =>
            bucket.runs >= MIN_RUNS_PER_HOUR && bucket.medianDownloadBps !== null,
    );

    if (counted.length < 2) {
        return null;
    }

    const fastest = counted.reduce((best, bucket) =>
        bucket.medianDownloadBps > best.medianDownloadBps ? bucket : best,
    );
    const slowest = counted.reduce((worst, bucket) =>
        bucket.medianDownloadBps < worst.medianDownloadBps ? bucket : worst,
    );

    return {
        fastestHour: fastest.hour,
        slowestHour: slowest.hour,
        ratio: slowest.medianDownloadBps / fastest.medianDownloadBps,
    };
}
