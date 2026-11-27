/**
 * The numbers behind the live link animation and the per-request trace. Pure,
 * so the shape of what the reader watches is pinned by tests rather than by
 * eye: a faster line streams more and quicker packets, never fewer.
 */

/** The rate the link animation treats as "as fast as it gets": 1 Gbps. */
export const FLOW_CEILING_BPS = 1_000_000_000;

/**
 * A rate as a 0–1 level on a log scale, so 5 Mbps and 50 Mbps look different
 * and 500 Mbps does not pin the needle. Ten-fold steps are roughly equal steps:
 * 10 Mbps sits a third of the way to the ceiling, 100 Mbps two thirds.
 */
export function throughputLevel(bps: number | null | undefined): number {
    if (bps === null || bps === undefined || !Number.isFinite(bps) || bps <= 0) {
        return 0;
    }

    // +1 keeps the curve at zero for a vanishing rate instead of going negative.
    const level = Math.log10(bps / 1_000_000 + 1) / Math.log10(FLOW_CEILING_BPS / 1_000_000 + 1);

    return Math.min(1, Math.max(0, level));
}

export type FlowPhase = "latency" | "download" | "upload";

/**
 * What the link between the reader and the edge is doing. `still` is idle or
 * finished; `ping` is a single packet bouncing for the round-trip phase;
 * `stream` is data moving, `in` toward the reader for a download and `out` for
 * an upload.
 */
export type Flow =
    | { readonly mode: "still" }
    | { readonly mode: "ping" }
    | { readonly mode: "stream"; readonly direction: "in" | "out"; readonly level: number };

export function flowFor(phase: FlowPhase | null, bps: number | null | undefined): Flow {
    if (phase === null) {
        return { mode: "still" };
    }

    if (phase === "latency") {
        return { mode: "ping" };
    }

    return {
        mode: "stream",
        direction: phase === "download" ? "in" : "out",
        level: throughputLevel(bps),
    };
}

/** How the packets in a stream move, per second of animation, at a given level. */
export type StreamPace = {
    /** Packets launched per second, across every lane. */
    readonly spawnPerSecond: number;
    /** Share of the link a packet covers per second. */
    readonly travelPerSecond: number;
    /** Share of the link a packet's streak spans. */
    readonly streak: number;
};

/**
 * Even a crawling line streams something, so a slow connection reads as slow
 * rather than as stalled; the top end stays under what a phone can draw.
 */
export function streamPace(level: number): StreamPace {
    const clamped = Math.min(1, Math.max(0, level));

    return {
        spawnPerSecond: 6 + 64 * clamped,
        travelPerSecond: 0.3 + 1.5 * clamped,
        streak: 0.025 + 0.085 * clamped,
    };
}

/**
 * Eases a shown value toward its target, independent of the frame rate: a
 * 144 Hz screen and a 60 Hz one settle in the same wall-clock time.
 */
export function approach(from: number, to: number, elapsedMs: number, halfLifeMs: number): number {
    if (elapsedMs <= 0 || halfLifeMs <= 0) {
        return elapsedMs > 0 ? to : from;
    }

    return to + (from - to) * 0.5 ** (elapsedMs / halfLifeMs);
}

export type TracePaths = {
    /** The line through every sample. */
    readonly line: string;
    /** The same line, closed down to the baseline, for the fill under it. */
    readonly area: string;
};

/**
 * An SVG path through samples in the order they were taken, scaled so the
 * largest value in `scaleMax` (or in the samples) touches the top. Shared
 * scaling lets download and upload sit on one chart honestly. Fewer than two
 * samples is not a line, and is `null`.
 */
export function tracePaths(
    samples: readonly number[],
    width: number,
    height: number,
    scaleMax?: number,
): TracePaths | null {
    const values = samples.filter((value) => Number.isFinite(value) && value >= 0);

    if (values.length < 2 || width <= 0 || height <= 0) {
        return null;
    }

    const top = Math.max(scaleMax ?? 0, ...values);

    if (top <= 0) {
        return null;
    }

    const step = width / (values.length - 1);
    const points = values.map((value, index) => {
        const x = round(index * step);
        const y = round(height - (value / top) * height);

        return `${x},${y}`;
    });
    const line = `M${points.join("L")}`;

    return { line, area: `${line}L${round(width)},${round(height)}L0,${round(height)}Z` };
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
