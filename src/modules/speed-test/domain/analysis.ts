import type {
    BufferbloatGrade,
    EngineSummary,
    PlanComparison,
    SpeedRun,
    UseCaseVerdict,
    Verdict,
} from "../types";
import {
    BUFFERBLOAT_LIMITS,
    CALM_GRADES,
    MAX_PLAN_INPUT_LENGTH,
    MAX_PLAN_MBPS,
    PLAN_FULL_SHARE,
    PLAN_MOST_SHARE,
    THRESHOLDS,
} from "./constants";
import { westernDigit } from "@/modules/tools/domain/bangla-digits";

function finite(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * A finished test as one record, or `null` when there is no download figure —
 * a run with no download is a failed run, and keeping it would put a zero on
 * the history chart that the line never measured.
 */
export function buildRun(summary: EngineSummary, at: number): SpeedRun | null {
    const download = finite(summary.download);

    if (download === null || download === 0) {
        return null;
    }

    const loaded = [finite(summary.downLoadedLatency), finite(summary.upLoadedLatency)].filter(
        (value): value is number => value !== null,
    );

    return {
        at,
        downloadBps: download,
        uploadBps: finite(summary.upload),
        latencyMs: finite(summary.latency),
        jitterMs: finite(summary.jitter),
        loadedLatencyMs: loaded.length === 0 ? null : Math.max(...loaded),
    };
}

/** How much the round trip grew under load, in ms; `null` when either side is missing. */
export function latencyIncrease(run: SpeedRun): number | null {
    if (run.latencyMs === null || run.loadedLatencyMs === null) {
        return null;
    }

    return Math.max(0, run.loadedLatencyMs - run.latencyMs);
}

export function bufferbloatGrade(run: SpeedRun): BufferbloatGrade | null {
    const increase = latencyIncrease(run);

    if (increase === null) {
        return null;
    }

    return BUFFERBLOAT_LIMITS.find((limit) => increase < limit.below)?.grade ?? "F";
}

function byBandwidth(
    bps: number | null,
    limits: { readonly great: number; readonly ok: number },
): Verdict {
    if (bps === null) {
        return "poor";
    }

    return bps >= limits.great ? "great" : bps >= limits.ok ? "ok" : "poor";
}

function videoCall(run: SpeedRun): UseCaseVerdict {
    const { great, ok } = THRESHOLDS.videoCall;
    const up = run.uploadBps ?? 0;
    const loaded = run.loadedLatencyMs ?? run.latencyMs ?? Infinity;
    const jitter = run.jitterMs ?? 0;

    const fails = (bar: typeof great | typeof ok) =>
        run.downloadBps < bar.down
            ? "download"
            : up < bar.up
              ? "upload"
              : loaded > bar.loadedLatency
                ? "bufferbloat"
                : jitter > bar.jitter
                  ? "jitter"
                  : null;

    const missedGreat = fails(great);

    if (missedGreat === null) {
        return { useCase: "video-call", verdict: "great", limitedBy: null };
    }

    const missedOk = fails(ok);

    return {
        useCase: "video-call",
        verdict: missedOk === null ? "ok" : "poor",
        limitedBy: missedOk ?? missedGreat,
    };
}

function gaming(run: SpeedRun): UseCaseVerdict {
    const { great, ok } = THRESHOLDS.gaming;
    const latency = run.latencyMs ?? Infinity;
    const jitter = run.jitterMs ?? 0;
    const grade = bufferbloatGrade(run);
    const calm = grade === null || CALM_GRADES.has(grade);

    if (latency <= great.latency && jitter <= great.jitter && calm) {
        return { useCase: "gaming", verdict: "great", limitedBy: null };
    }

    const limitedBy =
        latency > great.latency ? "latency" : jitter > great.jitter ? "jitter" : "bufferbloat";

    if (latency <= ok.latency && jitter <= ok.jitter) {
        return { useCase: "gaming", verdict: "ok", limitedBy };
    }

    return {
        useCase: "gaming",
        verdict: "poor",
        limitedBy: latency > ok.latency ? "latency" : "jitter",
    };
}

/**
 * What the line is good for, one verdict per use case, each naming the
 * measurement that held it back. "Great for 4K, poor for calls because of
 * bufferbloat" is the sentence nobody else's speed test says.
 */
export function verdictsByUseCase(run: SpeedRun): UseCaseVerdict[] {
    const streaming4k = byBandwidth(run.downloadBps, THRESHOLDS.streaming4k);
    const streamingHd = byBandwidth(run.downloadBps, THRESHOLDS.streamingHd);
    const liveUpload = byBandwidth(run.uploadBps, THRESHOLDS.liveUpload);

    return [
        {
            useCase: "streaming-4k",
            verdict: streaming4k,
            limitedBy: streaming4k === "great" ? null : "download",
        },
        {
            useCase: "streaming-hd",
            verdict: streamingHd,
            limitedBy: streamingHd === "great" ? null : "download",
        },
        videoCall(run),
        gaming(run),
        {
            useCase: "live-upload",
            verdict: liveUpload,
            limitedBy: liveUpload === "great" ? null : "upload",
        },
    ];
}

/** Seconds to move `bytes` at `bps`, or `null` when there is no rate to divide by. */
export function transferSeconds(bytes: number, bps: number | null): number | null {
    return bps === null || bps <= 0 ? null : (bytes * 8) / bps;
}

/**
 * A plan as typed — `20`, `২০`, `12.5` — in Mbps, or `null`. Short and
 * strict: it is a figure off a bill, not a document.
 */
export function parsePlanMbps(input: string): number | null {
    const trimmed = input.trim();

    if (trimmed.length === 0 || trimmed.length > MAX_PLAN_INPUT_LENGTH) {
        return null;
    }

    const normalised = [...trimmed].map((char) => westernDigit(char) ?? char).join("");

    if (!/^\d+(\.\d+)?$/.test(normalised)) {
        return null;
    }

    const mbps = Number(normalised);

    return mbps > 0 && mbps <= MAX_PLAN_MBPS ? mbps : null;
}

export function comparePlan(downloadBps: number, planMbps: number): PlanComparison {
    const share = downloadBps / (planMbps * 1_000_000);

    return {
        share,
        verdict: share >= PLAN_FULL_SHARE ? "full" : share >= PLAN_MOST_SHARE ? "most" : "short",
    };
}

export type DurationParts = {
    readonly hours: number;
    readonly minutes: number;
    readonly seconds: number;
};

/** Whole seconds split for reading: 4,295 s is 1 h 11 min 35 s. */
export function splitDuration(totalSeconds: number): DurationParts {
    const whole = Math.max(0, Math.round(totalSeconds));

    return {
        hours: Math.floor(whole / 3600),
        minutes: Math.floor((whole % 3600) / 60),
        seconds: whole % 60,
    };
}

/** Decimals worth showing for a rate in Mbps: 3.47, 47.3, 473. */
export function mbpsFractionDigits(bps: number): number {
    const mbps = bps / 1_000_000;

    return mbps < 10 ? 2 : mbps < 100 ? 1 : 0;
}
