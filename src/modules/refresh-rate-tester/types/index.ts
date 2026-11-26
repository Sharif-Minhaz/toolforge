/** Motion test speeds, slowest first. A literal union, so message keys stay checked. */
export const MOTION_SPEEDS = ["slow", "medium", "fast", "fastest"] as const;

export type MotionSpeed = (typeof MOTION_SPEEDS)[number];

export type FrameSummary = {
    /** Refreshes counted over the time they took, so a coarse clock averages out. */
    readonly hz: number;
    readonly medianIntervalMs: number;
    /** Standard deviation of the on-time intervals, in milliseconds. */
    readonly jitterMs: number;
    /** Refreshes the page missed: an interval spanning three refreshes missed two. */
    readonly droppedFrames: number;
    /** Intervals the summary was taken over. */
    readonly intervals: number;
    /** The common rate `hz` belongs to, or `null` when it is near none. */
    readonly nearestRate: number | null;
};

/**
 * Where a measurement stands. Three states, not one: a reader who has just
 * come back to the tab is warming up, not short of frames.
 */
export type FrameReading =
    | { readonly status: "warming_up" }
    | { readonly status: "collecting" }
    | { readonly status: "ready"; readonly summary: FrameSummary };
