import { analyzeRegex } from "../domain/analyze";
import type { RegexAnalysis, RegexAnalysisRequest } from "../types";

/**
 * Matching runs here rather than on the main thread for one reason: a pattern
 * like `(a+)+b` against the wrong input backtracks for longer than anyone will
 * wait, and there is no way to interrupt a running `RegExp` from inside. The
 * page cannot stop it — but it can stop *waiting* for it, terminate this worker,
 * and start a fresh one. That is only possible because the work is over here.
 */

export type RegexWorkerRequest = {
    /** Echoed back so a late reply for a superseded request can be ignored. */
    readonly key: string;
    readonly request: RegexAnalysisRequest;
};

export type RegexWorkerResponse = {
    readonly key: string;
    readonly analysis: RegexAnalysis;
};

/**
 * The minimal worker surface this file depends on, declared locally.
 * `DedicatedWorkerGlobalScope` lives in `lib.webworker`, which cannot be loaded
 * alongside `lib.dom` in one program — and `Window.postMessage` has a different
 * signature, so the built-in `self` would type-check the wrong call.
 */
type WorkerScope = {
    postMessage(message: RegexWorkerResponse): void;
    addEventListener(
        type: "message",
        listener: (event: MessageEvent<RegexWorkerRequest>) => void,
    ): void;
};

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener("message", (event) => {
    const { key, request } = event.data;

    scope.postMessage({ key, analysis: analyzeRegex(request) });
});
