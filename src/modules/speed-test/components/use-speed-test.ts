"use client";

import type SpeedTestEngine from "@cloudflare/speedtest";
import { useCallback, useEffect, useRef, useState } from "react";

import { logEvent } from "@/modules/observability/domain/logger";
import { buildRun } from "../domain/analysis";
import { MAX_TEST_DURATION_MS } from "../domain/constants";
import type { EngineSummary, SpeedRun } from "../types";

export type TestPhase = "latency" | "download" | "upload";

export type TestState =
    | { readonly status: "idle" }
    | {
          readonly status: "running";
          readonly phase: TestPhase;
          readonly live: EngineSummary;
          /** The latest single request, so the number moves while a set runs. */
          readonly currentBps: number | null;
      }
    | { readonly status: "done"; readonly run: SpeedRun }
    | { readonly status: "failed" };

/**
 * Cloudflare's measurement engine, driven from React. The engine is loaded on
 * the first press — the page does not carry it until a test is wanted — and
 * set up so nothing is reported back: both logging URLs are `null`, which the
 * library documents as the off switch.
 */
export function useSpeedTest(onFinished: (run: SpeedRun) => void) {
    const [state, setState] = useState<TestState>({ status: "idle" });
    const engineRef = useRef<SpeedTestEngine | null>(null);
    const finishedRef = useRef(onFinished);

    useEffect(() => {
        finishedRef.current = onFinished;
    }, [onFinished]);

    // A test left running when the page goes away would keep pulling data.
    useEffect(() => () => engineRef.current?.pause(), []);

    const start = useCallback(async () => {
        engineRef.current?.pause();
        setState({ status: "running", phase: "latency", live: {}, currentBps: null });

        const { default: SpeedTest } = await import("@cloudflare/speedtest");
        const engine = new SpeedTest({
            autoStart: false,
            logAimApiUrl: null,
            logMeasurementApiUrl: null,
            abortTestDuration: MAX_TEST_DURATION_MS,
        });

        engineRef.current = engine;

        engine.onResultsChange = ({ type }) => {
            if (engineRef.current !== engine) {
                return;
            }

            const results = engine.results;
            const phase: TestPhase =
                type === "download" ? "download" : type === "upload" ? "upload" : "latency";
            const points =
                phase === "download"
                    ? results.getDownloadBandwidthPoints()
                    : phase === "upload"
                      ? results.getUploadBandwidthPoints()
                      : [];

            setState({
                status: "running",
                phase,
                live: results.getSummary(),
                currentBps: points.at(-1)?.bps ?? null,
            });
        };

        engine.onFinish = (results) => {
            if (engineRef.current !== engine) {
                return;
            }

            const run = buildRun(results.getSummary(), Date.now());

            engineRef.current = null;

            if (run === null) {
                setState({ status: "failed" });
                return;
            }

            setState({ status: "done", run });
            finishedRef.current(run);
        };

        engine.onError = (error) => {
            // Most errors are one request failing and the run carrying on;
            // they are logged, and only a run with no download is a failure.
            logEvent("warn", "speed_test.measurement_error", { error: String(error) });
        };

        engine.play();
    }, []);

    const cancel = useCallback(() => {
        engineRef.current?.pause();
        engineRef.current = null;
        setState({ status: "idle" });
    }, []);

    return { state, start, cancel };
}
