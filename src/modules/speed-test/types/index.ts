/** One finished test, as kept in this browser's history. */
export type SpeedRun = {
    /** When it finished, in epoch milliseconds — an instant, so no zone is baked in. */
    readonly at: number;
    readonly downloadBps: number;
    /** `null` when the upload half could not be measured. */
    readonly uploadBps: number | null;
    /** Idle round trip, median of the idle samples. */
    readonly latencyMs: number | null;
    readonly jitterMs: number | null;
    /** The worse of the round trip while downloading and while uploading. */
    readonly loadedLatencyMs: number | null;
};

/**
 * How much the round trip grows while the line is busy, graded the way the
 * bufferbloat tests most people have met grade it: the increase in
 * milliseconds, not the loaded latency itself.
 */
export const BUFFERBLOAT_GRADES = ["A+", "A", "B", "C", "D", "F"] as const;

export type BufferbloatGrade = (typeof BUFFERBLOAT_GRADES)[number];

export const USE_CASES = [
    "streaming-4k",
    "streaming-hd",
    "video-call",
    "gaming",
    "live-upload",
] as const;

export type UseCase = (typeof USE_CASES)[number];

export const VERDICTS = ["great", "ok", "poor"] as const;

export type Verdict = (typeof VERDICTS)[number];

export type UseCaseVerdict = {
    readonly useCase: UseCase;
    readonly verdict: Verdict;
    /** The measurement that decided it, so the reason can be named. */
    readonly limitedBy: "download" | "upload" | "latency" | "jitter" | "bufferbloat" | null;
};

/** How a measured download compares with the plan the reader pays for. */
export const PLAN_VERDICTS = ["full", "most", "short"] as const;

export type PlanVerdict = (typeof PLAN_VERDICTS)[number];

export type PlanComparison = {
    /** Measured over advertised: 0.82 is 82 % of the plan. */
    readonly share: number;
    readonly verdict: PlanVerdict;
};

/** One hour of the day, over every kept run that finished in it. */
export type HourBucket = {
    /** 0–23, in the reader's own zone. */
    readonly hour: number;
    readonly runs: number;
    /** Median download of those runs, or `null` for an hour with none. */
    readonly medianDownloadBps: number | null;
};

export type PeakSlowdown = {
    readonly fastestHour: number;
    readonly slowestHour: number;
    /** Slowest median over fastest median: 0.6 means 40 % slower. */
    readonly ratio: number;
};

/** The engine's summary, reduced to the fields this tool reads. */
export type EngineSummary = {
    readonly download?: number;
    readonly upload?: number;
    readonly latency?: number;
    readonly jitter?: number;
    readonly downLoadedLatency?: number;
    readonly upLoadedLatency?: number;
};
