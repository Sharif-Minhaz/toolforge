import { describe, expect, test } from "bun:test";

import {
    bufferbloatGrade,
    buildRun,
    comparePlan,
    mbpsFractionDigits,
    parsePlanMbps,
    splitDuration,
    transferSeconds,
    verdictsByUseCase,
} from "@/modules/speed-test/domain/analysis";
import { LARGE_DOWNLOAD_BYTES } from "@/modules/speed-test/domain/constants";
import type { SpeedRun, UseCase } from "@/modules/speed-test/types";

const MBPS = 1_000_000;

function run(overrides: Partial<SpeedRun> = {}): SpeedRun {
    return {
        at: 0,
        downloadBps: 100 * MBPS,
        uploadBps: 50 * MBPS,
        latencyMs: 12,
        jitterMs: 2,
        loadedLatencyMs: 20,
        ...overrides,
    };
}

function verdictFor(useCase: UseCase, subject: SpeedRun) {
    return verdictsByUseCase(subject).find((item) => item.useCase === useCase);
}

describe("buildRun", () => {
    test("keeps the worse of the two loaded latencies", () => {
        expect(
            buildRun(
                {
                    download: 80 * MBPS,
                    upload: 20 * MBPS,
                    latency: 10,
                    jitter: 1,
                    downLoadedLatency: 40,
                    upLoadedLatency: 90,
                },
                1_700_000_000_000,
            ),
        ).toEqual({
            at: 1_700_000_000_000,
            downloadBps: 80 * MBPS,
            uploadBps: 20 * MBPS,
            latencyMs: 10,
            jitterMs: 1,
            loadedLatencyMs: 90,
        });
    });

    test("a run with no download is not a run", () => {
        expect(buildRun({ upload: 10 * MBPS }, 0)).toBeNull();
        expect(buildRun({ download: 0 }, 0)).toBeNull();
        expect(buildRun({ download: Number.NaN }, 0)).toBeNull();
    });

    test("missing halves become null rather than zero", () => {
        expect(buildRun({ download: 5 * MBPS }, 0)).toMatchObject({
            uploadBps: null,
            latencyMs: null,
            loadedLatencyMs: null,
        });
    });
});

describe("bufferbloatGrade", () => {
    test("grades the increase, not the loaded latency", () => {
        expect(bufferbloatGrade(run({ latencyMs: 200, loadedLatencyMs: 203 }))).toBe("A+");
        expect(bufferbloatGrade(run({ latencyMs: 10, loadedLatencyMs: 30 }))).toBe("A");
        expect(bufferbloatGrade(run({ latencyMs: 10, loadedLatencyMs: 69 }))).toBe("B");
        expect(bufferbloatGrade(run({ latencyMs: 10, loadedLatencyMs: 150 }))).toBe("C");
        expect(bufferbloatGrade(run({ latencyMs: 10, loadedLatencyMs: 400 }))).toBe("D");
        expect(bufferbloatGrade(run({ latencyMs: 10, loadedLatencyMs: 410 }))).toBe("F");
    });

    test("has no grade without both figures", () => {
        expect(bufferbloatGrade(run({ loadedLatencyMs: null }))).toBeNull();
    });
});

describe("verdictsByUseCase", () => {
    test("a fast, calm line is great at everything", () => {
        expect(verdictsByUseCase(run()).every((item) => item.verdict === "great")).toBe(true);
    });

    test("a fast line with bufferbloat is still poor for calls, and says why", () => {
        const bloated = run({ latencyMs: 15, loadedLatencyMs: 450 });

        expect(verdictFor("streaming-4k", bloated)?.verdict).toBe("great");
        expect(verdictFor("video-call", bloated)).toEqual({
            useCase: "video-call",
            verdict: "poor",
            limitedBy: "bufferbloat",
        });
        expect(verdictFor("gaming", bloated)).toEqual({
            useCase: "gaming",
            verdict: "ok",
            limitedBy: "bufferbloat",
        });
    });

    test("4K needs 25 Mbps for great and 15 for ok", () => {
        expect(verdictFor("streaming-4k", run({ downloadBps: 25 * MBPS }))?.verdict).toBe("great");
        expect(verdictFor("streaming-4k", run({ downloadBps: 15 * MBPS }))?.verdict).toBe("ok");
        expect(verdictFor("streaming-4k", run({ downloadBps: 14 * MBPS }))).toEqual({
            useCase: "streaming-4k",
            verdict: "poor",
            limitedBy: "download",
        });
    });

    test("a slow upload holds back calls and live streaming", () => {
        const thin = run({ uploadBps: 0.5 * MBPS });

        expect(verdictFor("video-call", thin)).toMatchObject({
            verdict: "poor",
            limitedBy: "upload",
        });
        expect(verdictFor("live-upload", thin)).toMatchObject({
            verdict: "poor",
            limitedBy: "upload",
        });
    });

    test("a distant server makes gaming poor on latency alone", () => {
        expect(verdictFor("gaming", run({ latencyMs: 180 }))).toEqual({
            useCase: "gaming",
            verdict: "poor",
            limitedBy: "latency",
        });
    });
});

describe("transferSeconds", () => {
    test("5 GiB at 100 Mbps is about seven minutes", () => {
        expect(transferSeconds(LARGE_DOWNLOAD_BYTES, 100 * MBPS)).toBeCloseTo(429.5, 1);
    });

    test("has no answer without a rate", () => {
        expect(transferSeconds(1, null)).toBeNull();
        expect(transferSeconds(1, 0)).toBeNull();
    });
});

describe("the plan", () => {
    test("reads a figure off a bill, in either digits", () => {
        expect(parsePlanMbps("20")).toBe(20);
        expect(parsePlanMbps(" ১২.৫ ")).toBe(12.5);
        expect(parsePlanMbps("20 Mbps")).toBeNull();
        expect(parsePlanMbps("0")).toBeNull();
        expect(parsePlanMbps("")).toBeNull();
        expect(parsePlanMbps("1000000")).toBeNull();
    });

    test("compares the download with it", () => {
        expect(comparePlan(19 * MBPS, 20)).toEqual({ share: 0.95, verdict: "full" });
        expect(comparePlan(15 * MBPS, 20)).toEqual({ share: 0.75, verdict: "most" });
        expect(comparePlan(8 * MBPS, 20)).toEqual({ share: 0.4, verdict: "short" });
    });
});

describe("splitDuration and mbpsFractionDigits", () => {
    test("splits seconds for reading", () => {
        expect(splitDuration(4_295)).toEqual({ hours: 1, minutes: 11, seconds: 35 });
        expect(splitDuration(42.4)).toEqual({ hours: 0, minutes: 0, seconds: 42 });
    });

    test("shows fewer decimals the faster the line", () => {
        expect(mbpsFractionDigits(3.47 * MBPS)).toBe(2);
        expect(mbpsFractionDigits(47.3 * MBPS)).toBe(1);
        expect(mbpsFractionDigits(473 * MBPS)).toBe(0);
    });
});
