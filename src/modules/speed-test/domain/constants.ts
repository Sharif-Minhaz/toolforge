import type { BufferbloatGrade } from "../types";

/**
 * Upper bounds, in ms of added round trip, for each bufferbloat grade — the
 * scale Waveform's bufferbloat test popularised. Anything past the last is F.
 */
export const BUFFERBLOAT_LIMITS: readonly {
    readonly grade: BufferbloatGrade;
    readonly below: number;
}[] = [
    { grade: "A+", below: 5 },
    { grade: "A", below: 30 },
    { grade: "B", below: 60 },
    { grade: "C", below: 200 },
    { grade: "D", below: 400 },
];

/** Grades good enough that a busy line does not spoil a call or a game. */
export const CALM_GRADES: ReadonlySet<BufferbloatGrade> = new Set(["A+", "A", "B"]);

const MBPS = 1_000_000;

/**
 * What each use case needs, from the services' own published figures: Netflix
 * asks 15 Mbps for 4K and YouTube 20; Netflix 5 for HD; Zoom 3.8 down and 3.0
 * up for an HD group call; a 1080p live stream about 6 up. Gaming has no
 * bandwidth floor worth naming — it is the round trip and its steadiness.
 */
export const THRESHOLDS = {
    streaming4k: { great: 25 * MBPS, ok: 15 * MBPS },
    streamingHd: { great: 10 * MBPS, ok: 5 * MBPS },
    videoCall: {
        great: { down: 3.8 * MBPS, up: 3 * MBPS, loadedLatency: 150, jitter: 30 },
        ok: { down: 1.5 * MBPS, up: 1 * MBPS, loadedLatency: 300, jitter: 60 },
    },
    gaming: {
        great: { latency: 40, jitter: 10 },
        ok: { latency: 80, jitter: 30 },
    },
    liveUpload: { great: 10 * MBPS, ok: 5 * MBPS },
} as const;

/** The two transfers the result is translated into: a big game download and a phone video upload. */
export const LARGE_DOWNLOAD_BYTES = 5 * 1024 ** 3;
export const LARGE_UPLOAD_BYTES = 1024 ** 3;

/** At or above this share of the plan the line is delivering what was sold. */
export const PLAN_FULL_SHARE = 0.9;
export const PLAN_MOST_SHARE = 0.7;

/** A plan in Mbps: up to 100 Gbps, which no home line is. */
export const MAX_PLAN_MBPS = 100_000;
export const MAX_PLAN_INPUT_LENGTH = 8;

/** Runs kept. A hundred is months of one-a-day, which is what the hour chart needs. */
export const MAX_KEPT_RUNS = 100;

/** An hour needs this many runs before it counts towards the slowdown claim. */
export const MIN_RUNS_PER_HOUR = 2;

export const RUNS_STORAGE_KEY = "toolforge:speed-test:runs";
export const PLAN_STORAGE_KEY = "toolforge:speed-test:plan";

/**
 * A run never takes longer than this. On a line too slow to finish the larger
 * files the test ends with what it has, rather than leaving the reader
 * watching a stalled gauge.
 */
export const MAX_TEST_DURATION_MS = 90_000;
