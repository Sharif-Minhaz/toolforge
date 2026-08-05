import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { MAX_EXECUTION_MS, MAX_PATH_LENGTH } from "../domain/constants";
import { isJsonType } from "../domain/content-type";
import { executeGraph, withoutBody } from "../domain/execute";
import { matchEndpoint } from "../domain/match";
import { createSeededRandom, resolveSeed } from "../domain/seeded-random";
import { checkServerKey } from "../domain/server-key";
import { createFakerProvider, loadFaker } from "./faker";
import { MAX_OUTBOUND_CALLS } from "../domain/outbound";
import { guardedFetch } from "./outbound";
import { spendOutboundQuota } from "./quota";
import { DEFAULT_ENVIRONMENT, resolveEnvironment } from "../domain/environment";
import { findCandidateRoutes, findEndpointExecution, findServerByKey } from "./execute";
import { listVariables } from "./variables";
import { isMockStorageConfigured } from "./config";
import type { LoggedTrace } from "../domain/log-record";
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
    | {
          readonly kind: "response";
          readonly response: MockResponse;
          readonly endpointId: string;
          /** Echoed back as `X-Mock-Seed`, so a caller can pin what they just saw. */
          readonly seed: string;
          readonly trace: LoggedTrace;
          readonly durationMs: number;
          readonly workspaceId: string;
          readonly serverId: string;
      }
    | { readonly kind: "not_found" }
    | { readonly kind: "paused" }
    | { readonly kind: "unavailable" }
    | { readonly kind: "method_not_allowed"; readonly allowed: readonly HttpMethod[] }
    | { readonly kind: "options"; readonly allowed: readonly HttpMethod[] }
    | {
          readonly kind: "failed";
          readonly reason: string;
          readonly endpointId: string;
          readonly trace: LoggedTrace;
          readonly durationMs: number;
          readonly workspaceId: string;
          readonly serverId: string;
      };

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

        const endpoint = await findEndpointExecution(match.endpointId);

        if (endpoint === null) {
            return { kind: "not_found" };
        }

        const { graph } = endpoint;

        // Read once per request and flattened here rather than inside the
        // executor, so `domain/` stays free of I/O and the merge order — the
        // part that is actually subtle — is unit-tested on its own.
        const env = resolveEnvironment(
            await listVariables(server.workspaceId),
            {
                workspaceId: server.workspaceId,
                serverId: server.id,
                collectionId: endpoint.collectionId,
            },
            incoming.headers["x-mock-environment"] ?? DEFAULT_ENVIRONMENT,
        );

        const request: NormalizedRequest = {
            method: incoming.method,
            path: incoming.path,
            params: match.params,
            query: incoming.query,
            headers: incoming.headers,
            cookies: incoming.cookies,
            body: readBody(incoming.rawBody, incoming.headers["content-type"] ?? ""),
        };

        // A caller may pin the seed, which is what makes a mock usable as a
        // test fixture: the same request comes back byte-identical. Without one
        // it is derived from the endpoint and the path, so two routes do not
        // hand back the same "random" name while a single route stays stable
        // enough to be recognisable between calls.
        const seed = resolveSeed(
            incoming.headers["x-mock-seed"] ?? incoming.query.__seed,
            match.endpointId,
            incoming.path,
        );
        const random = createSeededRandom(seed);

        // Loaded only when the graph actually asks for fake data — the package
        // is three megabytes and most endpoints return static shapes.
        const faker = usesFaker(graph) ? createFakerProvider(await loadFaker(), random) : undefined;

        let outboundCalls = 0;
        const startedAt = performance.now();
        const context: ExecutionContext = {
            request,
            env,
            clock: () => performance.now(),
            now: () => Date.now(),
            random,
            faker: faker === undefined ? undefined : (id) => faker(id),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            // Wired in only when the graph actually contains an outbound node,
            // so an ordinary mock's context literally cannot reach the network.
            // The two gates it runs are ordered by cost: the per-execution
            // counter is free and local, the quota is a database write.
            outbound: usesHttpRequest(graph)
                ? async (call) => {
                      if (outboundCalls >= MAX_OUTBOUND_CALLS) {
                          return { ok: false, reason: "too_many_calls" };
                      }

                      outboundCalls += 1;

                      // Fails closed. No salt or no database means no outbound
                      // request, because an unmetered one is an amplifier
                      // carrying this deployment's address.
                      if (!(await spendOutboundQuota(server.workspaceId))) {
                          return { ok: false, reason: "quota_exhausted" };
                      }

                      const fetched = await guardedFetch({
                          url: call.url,
                          method: call.method,
                          headers: call.headers,
                          body: call.body,
                      });

                      return fetched.ok
                          ? {
                                ok: true,
                                status: fetched.result.status,
                                headers: fetched.result.headers,
                                body: fetched.result.body,
                            }
                          : { ok: false, reason: fetched.reason };
                  }
                : undefined,
            deadlineAt: startedAt + MAX_EXECUTION_MS,
            vars: {},
        };

        const result = await executeGraph(graph, context);

        if (!result.ok) {
            logEvent("warn", "mock_server.execution_failed", {
                reason: result.reason,
                endpointId: match.endpointId,
            });

            return {
                kind: "failed",
                reason: result.reason,
                endpointId: match.endpointId,
                trace: { nodes: result.trace, log: result.log },
                durationMs: Math.round(performance.now() - startedAt),
                workspaceId: server.workspaceId,
                serverId: server.id,
            };
        }

        return {
            kind: "response",
            endpointId: match.endpointId,
            seed,
            trace: { nodes: result.trace, log: result.log },
            durationMs: Math.round(performance.now() - startedAt),
            workspaceId: server.workspaceId,
            serverId: server.id,
            response: match.bodyless ? withoutBody(result.response) : result.response,
        };
    } catch (caught) {
        logEvent("error", "mock_server.serve_failed", { error: describeError(caught) });

        return { kind: "unavailable" };
    }
}

/**
 * Whether a stored graph mentions fake data anywhere.
 *
 * A crude scan of the serialised document rather than a walk of the value tree,
 * deliberately: it runs once per request on the hot path, it only has to answer
 * "might this need the three-megabyte import", and a false positive costs one
 * lazy import while a false negative is impossible — the string `"faker"`
 * appears in every such value's `kind`.
 */
function usesFaker(graph: unknown): boolean {
    return mentions(graph, '"faker"');
}

/** The same cheap scan, for the node that must not be reachable by default. */
function usesHttpRequest(graph: unknown): boolean {
    return mentions(graph, '"httpRequest"');
}

function mentions(graph: unknown, needle: string): boolean {
    try {
        return JSON.stringify(graph)?.includes(needle) ?? false;
    } catch {
        return false;
    }
}
