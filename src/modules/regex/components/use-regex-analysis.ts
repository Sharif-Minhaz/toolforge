"use client";

import { useEffect, useRef, useState } from "react";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { analyzeRegex } from "../domain/analyze";
import { WORKER_TIMEOUT_MS } from "../domain/constants";
import { parseFlagLetters } from "../domain/flags";
import type { RegexAnalysis, RegexAnalysisRequest, RegexMode } from "../types";
import type { RegexWorkerRequest, RegexWorkerResponse } from "../workers/regex-worker";

/**
 * Runs the analysis in a worker, with a hard kill timer behind it.
 *
 * A pattern like `(a+)+b` against the wrong input backtracks for longer than
 * anyone will wait, and a running `RegExp` cannot be interrupted from inside.
 * The page cannot stop it — but it can stop waiting, terminate the worker, and
 * build a fresh one on the next keystroke. That is the whole reason the work
 * happens off-thread.
 *
 * Every parameter is a primitive on purpose: an options object would be a new
 * identity each render, and the posting effect would fire on renders where
 * nothing about the request had changed.
 */
export type RegexAnalysisParams = {
    readonly pattern: string;
    /** Flags as letters (`"gm"`), so the dependency stays a stable primitive. */
    readonly flagLetters: string;
    readonly mode: RegexMode;
    readonly replacement: string;
    readonly testString: string;
};

export type RegexAnalysisState = {
    readonly analysis: RegexAnalysis;
    /** The shown result is for an earlier request; dim it, do not blank it. */
    readonly pending: boolean;
};

type Settled = {
    readonly key: string;
    readonly analysis: RegexAnalysis;
};

function toKey(params: RegexAnalysisParams): string {
    return JSON.stringify([
        params.pattern,
        params.flagLetters,
        params.mode,
        params.replacement,
        params.testString,
    ]);
}

/**
 * The pattern-derived panels stay correct when a run is killed — it is the
 * matching that never came back — so only the match side is cleared.
 */
function timedOutAnalysis(previous: RegexAnalysis): RegexAnalysis {
    return {
        ...previous,
        failure: { reason: "timed_out" },
        matches: [],
        truncated: false,
        output: "",
    };
}

export function useRegexAnalysis(
    params: RegexAnalysisParams,
    initialAnalysis: RegexAnalysis,
): RegexAnalysisState {
    const { pattern, flagLetters, mode, replacement, testString } = params;
    const key = toKey(params);

    const [settled, setSettled] = useState<Settled>(() => ({ key, analysis: initialAnalysis }));
    const workerRef = useRef<Worker | null>(null);
    const timerRef = useRef<number | null>(null);
    /** Seeded with the first key, so mount does not redo the server's work. */
    const postedRef = useRef(key);
    /** Latched once a worker proves unusable, so it is not retried per keystroke. */
    const degradedRef = useRef(false);
    /** Lets the worker's own error handler re-run the request it lost. */
    const requestRef = useRef<RegexAnalysisRequest | null>(null);

    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;

            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (postedRef.current === key) {
            return;
        }

        postedRef.current = key;

        const request: RegexAnalysisRequest = {
            pattern,
            flags: parseFlagLetters(flagLetters),
            mode,
            replacement,
            testString,
        };

        requestRef.current = request;

        function stopTimer() {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }

        /**
         * The degraded path: no worker to be had, so the analysis runs on this
         * thread and the two-second guarantee is simply not on offer.
         *
         * Deferred rather than called inline, because a `setState` in an effect
         * body is what `react-hooks/set-state-in-effect` forbids — and this is a
         * real side effect, not a derivation.
         */
        function runOnThisThread(forKey: string, forRequest: RegexAnalysisRequest) {
            window.setTimeout(
                () => setSettled({ key: forKey, analysis: analyzeRegex(forRequest) }),
                0,
            );
        }

        if (degradedRef.current) {
            runOnThisThread(key, request);

            return;
        }

        let worker = workerRef.current;

        if (worker === null) {
            try {
                worker = new Worker(new URL("../workers/regex-worker.ts", import.meta.url), {
                    type: "module",
                });
                // Both listeners outlive this effect, so they read the key off
                // the message or the ref rather than closing over this run's.
                worker.addEventListener("message", (event: MessageEvent<RegexWorkerResponse>) => {
                    if (event.data.key !== postedRef.current) {
                        return;
                    }

                    stopTimer();
                    setSettled({ key: event.data.key, analysis: event.data.analysis });
                });
                // The worker failed to start, or threw on the way in. Latch the
                // degradation rather than rebuilding a broken worker — and the
                // request it lost still has to be answered.
                worker.addEventListener("error", (event) => {
                    logEvent("error", "regex.worker_failed", { error: event.message });
                    stopTimer();
                    degradedRef.current = true;
                    workerRef.current?.terminate();
                    workerRef.current = null;

                    const lost = requestRef.current;

                    if (lost !== null) {
                        runOnThisThread(postedRef.current, lost);
                    }
                });
                workerRef.current = worker;
            } catch (caught) {
                logEvent("error", "regex.worker_unavailable", { error: describeError(caught) });
                degradedRef.current = true;
                runOnThisThread(key, request);

                return;
            }
        }

        stopTimer();

        // A worker that has not answered by now is stuck inside a single
        // catastrophic match and never will.
        timerRef.current = window.setTimeout(() => {
            logEvent("warn", "regex.worker_timed_out", { timeoutMs: WORKER_TIMEOUT_MS });
            workerRef.current?.terminate();
            workerRef.current = null;
            timerRef.current = null;
            setSettled((current) => ({ key, analysis: timedOutAnalysis(current.analysis) }));
        }, WORKER_TIMEOUT_MS);

        const message: RegexWorkerRequest = { key, request };
        worker.postMessage(message);
    }, [key, pattern, flagLetters, mode, replacement, testString]);

    return { analysis: settled.analysis, pending: key !== settled.key };
}
