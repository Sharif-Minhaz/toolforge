import { formatJson, type JsonFormatRequest, type JsonFormatResult } from "../domain/format";

/**
 * Formatting runs here rather than on the main thread because its cost is
 * unbounded in the one direction the page cannot control: document size. A
 * megabyte of JSON builds an abstract syntax tree of a million-odd objects,
 * serialises it back out, walks it again for the statistics, and measures both
 * ends in UTF-8 — seconds of straight-line work on a modest machine, and not a
 * single one of those seconds is interruptible. On the main thread that reads
 * as a frozen tab. Over here the page keeps painting and accepting keystrokes
 * while the answer is prepared.
 *
 * Nothing else lives in this module. The request carries the whole document, so
 * every extra round trip is another copy of it.
 */

export type JsonWorkerRequest = {
    /**
     * Monotonic, so a late reply for a superseded document can be dropped. A
     * number rather than a hash of the request: hashing would mean walking the
     * document on the main thread, which is what this worker exists to avoid.
     */
    readonly key: number;
    readonly request: JsonFormatRequest;
};

export type JsonWorkerResponse = {
    readonly key: number;
    readonly result: JsonFormatResult;
};

/**
 * The minimal worker surface this file depends on, declared locally.
 * `DedicatedWorkerGlobalScope` lives in `lib.webworker`, which cannot be loaded
 * alongside `lib.dom` in one program — and `Window.postMessage` has a different
 * signature, so the built-in `self` would type-check the wrong call.
 */
type WorkerScope = {
    postMessage(message: JsonWorkerResponse): void;
    addEventListener(
        type: "message",
        listener: (event: MessageEvent<JsonWorkerRequest>) => void,
    ): void;
};

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener("message", (event) => {
    const { key, request } = event.data;

    scope.postMessage({ key, result: formatJson(request) });
});
