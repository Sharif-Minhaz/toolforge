"use client";

import { useEffect, useRef, useState } from "react";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { formatJson, type JsonFormatRequest, type JsonFormatResult } from "../domain/format";
import type { JsonWorkerRequest, JsonWorkerResponse } from "../workers/json-worker";

/**
 * Formats in a worker, and falls back to this thread only when there is no
 * worker to be had.
 *
 * The whole point is that `formatJson` is not interruptible: once a large
 * document is being parsed, nothing on the main thread runs until it finishes —
 * not the caret, not a scroll, not the tab's own close button. Moving it off
 * the main thread does not make it faster, it makes it invisible.
 */
export type JsonFormatState = {
    readonly result: JsonFormatResult;
    /** The shown result is for an earlier document; dim it, do not blank it. */
    readonly pending: boolean;
};

type Settled = {
    readonly request: JsonFormatRequest;
    readonly result: JsonFormatResult;
};

/**
 * Field by field, because the caller builds a fresh request object each render
 * and `options` is the only part with a stable identity. Comparing the document
 * is cheap in the case that matters: unchanged text is the same string
 * reference, so equality settles without reading a character.
 */
function isSameRequest(a: JsonFormatRequest, b: JsonFormatRequest): boolean {
    return a.mode === b.mode && a.input === b.input && a.options === b.options;
}

export function useJsonFormat(
    request: JsonFormatRequest,
    initialResult: JsonFormatResult,
): JsonFormatState {
    const { mode, input, options } = request;

    const [settled, setSettled] = useState<Settled>(() => ({ request, result: initialResult }));
    const workerRef = useRef<Worker | null>(null);
    /**
     * The request last handed to the worker. Seeded with the first one so mount
     * does not redo the work the server already did, and read by the message
     * listener, which outlives the effect that registered it.
     */
    const postedRef = useRef<JsonFormatRequest>(request);
    /** Bumped per post; a reply carrying anything else is already stale. */
    const sequenceRef = useRef(0);
    /** Latched once a worker proves unusable, so it is not retried per edit. */
    const degradedRef = useRef(false);

    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const next: JsonFormatRequest = { mode, input, options };

        if (isSameRequest(postedRef.current, next)) {
            return;
        }

        postedRef.current = next;
        sequenceRef.current += 1;

        const key = sequenceRef.current;

        /**
         * The degraded path: no worker to be had, so the document is formatted
         * on this thread and the responsiveness guarantee is simply not on
         * offer.
         *
         * Deferred rather than called inline, because a `setState` in an effect
         * body is what `react-hooks/set-state-in-effect` forbids — and this is a
         * real side effect, not a derivation.
         */
        function runOnThisThread(forRequest: JsonFormatRequest) {
            window.setTimeout(
                () => setSettled({ request: forRequest, result: formatJson(forRequest) }),
                0,
            );
        }

        if (degradedRef.current) {
            runOnThisThread(next);

            return;
        }

        let worker = workerRef.current;

        if (worker === null) {
            try {
                worker = new Worker(new URL("../workers/json-worker.ts", import.meta.url), {
                    type: "module",
                });
                // Both listeners outlive this effect, so they read the request
                // off the ref rather than closing over this run's.
                worker.addEventListener("message", (event: MessageEvent<JsonWorkerResponse>) => {
                    if (event.data.key !== sequenceRef.current) {
                        return;
                    }

                    setSettled({ request: postedRef.current, result: event.data.result });
                });
                // The worker failed to start, or threw on the way in. Latch the
                // degradation rather than rebuilding a broken worker — and the
                // document it lost still has to be answered.
                worker.addEventListener("error", (event) => {
                    logEvent("error", "json.worker_failed", { error: event.message });
                    degradedRef.current = true;
                    workerRef.current?.terminate();
                    workerRef.current = null;

                    runOnThisThread(postedRef.current);
                });
                workerRef.current = worker;
            } catch (caught) {
                logEvent("error", "json.worker_unavailable", { error: describeError(caught) });
                degradedRef.current = true;
                runOnThisThread(next);

                return;
            }
        }

        const message: JsonWorkerRequest = { key, request: next };

        worker.postMessage(message);
    }, [mode, input, options]);

    return {
        result: settled.result,
        pending: !isSameRequest(settled.request, { mode, input, options }),
    };
}
