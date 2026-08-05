import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { MAX_EXECUTION_MS, MAX_PATH_LENGTH } from "../domain/constants";
import { isJsonType } from "../domain/content-type";
import { executeGraph, withoutBody } from "../domain/execute";
import { matchEndpoint } from "../domain/match";
import { checkServerKey } from "../domain/server-key";
import { findCandidateRoutes, findEndpointGraph, findServerByKey } from "./execute";
import { isMockStorageConfigured } from "./config";
import type {
    ExecutionContext,
    HttpMethod,
    JsonValue,
    MockResponse,
    NormalizedRequest,
} from "../types/graph";

/**
 * One public request, from bytes to bytes.
 *
 * The single place the studio's data becomes somebody else's HTTP response, and
 * the gates run cheapest-first exactly as the design says: the key's *shape* is
 * checked before any query, so a scripted walk of the keyspace never reaches
 * Postgres; the path length is checked before it is split; and the graph is
 * fetched only for the endpoint that actually won.
 */

export type ServeOutcome =
    | { readonly kind: "response"; readonly response: MockResponse; readonly endpointId: string }
    | { readonly kind: "not_found" }
    | { readonly kind: "paused" }
    | { readonly kind: "unavailable" }
    | { readonly kind: "method_not_allowed"; readonly allowed: readonly HttpMethod[] }
    | { readonly kind: "options"; readonly allowed: readonly HttpMethod[] }
    | { readonly kind: "failed"; readonly reason: string; readonly endpointId: string };

export type IncomingRequest = {
    readonly serverKey: string;
    readonly method: HttpMethod;
    readonly path: string;
    readonly query: Readonly<Record<string, string>>;
    readonly headers: Readonly<Record<string, string>>;
    readonly cookies: Readonly<Record<string, string>>;
    readonly rawBody: string;
};

/**
 * Parsed when the request says JSON, kept as text otherwise.
 *
 * A body that claims to be JSON and is not degrades to the raw text rather than
 * failing the request: the mock's own graph decides what it cares about, and
 * refusing here would answer a question nobody asked.
 */
function readBody(rawBody: string, contentType: string): JsonValue {
    if (rawBody === "" || !isJsonType(contentType)) {
        return rawBody === "" ? null : rawBody;
    }

    try {
        return JSON.parse(rawBody) as JsonValue;
    } catch {
        return rawBody;
    }
}

export async function serveMockRequest(incoming: IncomingRequest): Promise<ServeOutcome> {
    if (!isMockStorageConfigured()) {
        return { kind: "unavailable" };
    }

    // Shape before storage. A key that could never have been stored costs a
    // regular expression rather than a round trip.
    const key = checkServerKey(incoming.serverKey);

    if (!key.ok) {
        return { kind: "not_found" };
    }

    if (incoming.path.length > MAX_PATH_LENGTH) {
        return { kind: "not_found" };
    }

    try {
        const server = await findServerByKey(key.key);

        if (server === null) {
            return { kind: "not_found" };
        }

        if (server.isPaused) {
            // 503 rather than 404, so a caller can tell "switched off" from
            // "never existed" — which is the difference between waiting and
            // checking the address.
            return { kind: "paused" };
        }

        const routes = await findCandidateRoutes(server.id, incoming.path);
        const match = matchEndpoint(routes, incoming.method, incoming.path);

        if (match.kind === "not_found") {
            return { kind: "not_found" };
        }

        if (match.kind === "method_not_allowed") {
            return { kind: "method_not_allowed", allowed: match.allowed };
        }

        if (match.kind === "options") {
            return { kind: "options", allowed: match.allowed };
        }

        const graph = await findEndpointGraph(match.endpointId);

        if (graph === null) {
            return { kind: "not_found" };
        }

        const request: NormalizedRequest = {
            method: incoming.method,
            path: incoming.path,
            params: match.params,
            query: incoming.query,
            headers: incoming.headers,
            cookies: incoming.cookies,
            body: readBody(incoming.rawBody, incoming.headers["content-type"] ?? ""),
        };

        const startedAt = performance.now();
        const context: ExecutionContext = {
            request,
            env: {},
            clock: () => performance.now(),
            // Unseeded for now. M2 replaces this with a seeded generator so the
            // reproducibility invariant holds for a real request, not only in
            // a test — the executor already takes it as a parameter.
            random: () => Math.random(),
            deadlineAt: startedAt + MAX_EXECUTION_MS,
            vars: {},
        };

        const result = executeGraph(graph, context);

        if (!result.ok) {
            logEvent("warn", "mock_server.execution_failed", {
                reason: result.reason,
                endpointId: match.endpointId,
            });

            return { kind: "failed", reason: result.reason, endpointId: match.endpointId };
        }

        return {
            kind: "response",
            endpointId: match.endpointId,
            response: match.bodyless ? withoutBody(result.response) : result.response,
        };
    } catch (caught) {
        logEvent("error", "mock_server.serve_failed", { error: describeError(caught) });

        return { kind: "unavailable" };
    }
}
