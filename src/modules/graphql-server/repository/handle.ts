import "server-only";

import { after } from "next/server";

import { MAX_UPLOAD_BYTES } from "@/modules/tools/domain/document-limits";
import type { RateVerdict } from "@/modules/tools/domain/rate-window";
import { checkServerKey } from "@/modules/tools/domain/server-key";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import type { RateBucket } from "../domain/rate-limit";
import { writeRequestLog } from "./logs";
import { spendServeQuota, sweepQuotaRows } from "./rate-limit";
import { serveGraphqlRequest } from "./serve";
import type { GraphqlRequest } from "../types";

/**
 * Where a GraphQL server actually answers.
 *
 * A Route Handler rather than a page, and the fifth in this repository where
 * that is the right call: the client is somebody else's program, there is no UI
 * to render, and what it needs is a real HTTP response carrying headers and a
 * status a page cannot set.
 *
 * ## The transport rules, and why each one is not optional
 *
 * **`GET` may not run a mutation.** The GraphQL-over-HTTP specification makes
 * `GET` the safe, idempotent method, and honouring that is what stops a link —
 * in an email, in a crawler's queue, in a chat client's link-preview fetcher —
 * from writing to somebody's fixture. It is enforced in the engine rather than
 * here, because only the parsed operation knows what a document does.
 *
 * **A batch is refused.** An array body means "run all of these", which is N
 * documents in one rate-limited request and therefore a hole straight through
 * the limiter. Refusing it costs nothing: batching is a client-side optimisation
 * nobody needs against a fixture.
 *
 * **The response media type follows `Accept`.** A client that asks for
 * `application/graphql-response+json` gets it, with the specification's status
 * codes; everything else gets `application/json`, which is what every existing
 * client understands. A request error is a **400** either way — the legacy
 * "always 200" behaviour is permitted for `application/json`, and it is the one
 * that makes a typo in a query indistinguishable from a successful request in
 * every network tab and every log.
 *
 * ## The headers
 *
 * - **`Content-Security-Policy: sandbox`** and **`X-Content-Type-Options:
 *   nosniff`.** The response body is somebody's stored data. Sandboxing denies
 *   it an origin, and `nosniff` stops a browser deciding for itself that some
 *   JSON is really HTML.
 * - **`X-Robots-Tag: noindex, nofollow`.** A fixture API is not content this
 *   site is publishing, and its address should not accumulate search presence.
 * - **`Referrer-Policy: no-referrer`** and **`Cache-Control: no-store`.**
 * - **`Access-Control-Allow-Origin: *`.** The point is that a front end on
 *   localhost can call it. Permissive by design and safe here because there is
 *   nothing to authenticate against — no cookie of ours is readable from this
 *   path, and none is sent.
 * - **`x-graphql-cost` and `x-graphql-depth`.** The two numbers the guard
 *   computed, on every answer rather than only on a refusal. A developer
 *   watching the network tab sees the estimate climb as they nest one more
 *   relation, which is the difference between "the API randomly 400s" and "ah,
 *   that is what is expensive".
 *
 * ## The gates, cheapest first
 *
 * 1. **Method**, then **key shape** — a comparison and a regular expression. A
 *    scripted walk of the keyspace costs no database work and no counter.
 * 2. **Body size** — a header read. A gigabyte `POST` is refused before it is
 *    buffered, which is the one gate that has to come before the thing it
 *    protects rather than after.
 * 3. **The rate limit** — the first statement that touches Postgres, and the
 *    only gate that bounds *volume*. Everything above refuses one bad request;
 *    this refuses the thousandth good one. It fails closed.
 * 4. **Serving** — the row read, the plan, the engine, and the row lock if it
 *    mutates.
 */

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
    ["x-robots-tag", "noindex, nofollow"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["cache-control", "no-store"],
    ["content-security-policy", "sandbox"],
    ["access-control-allow-origin", "*"],
    ["access-control-allow-headers", "content-type, accept"],
    ["access-control-allow-methods", "GET, POST, OPTIONS"],
    [
        "access-control-expose-headers",
        "x-graphql-cost, x-graphql-depth, x-ratelimit-remaining, x-ratelimit-reset",
    ],
    ["vary", "origin, accept"],
];

/** The media type the specification defines, for clients that ask for it. */
const SPEC_MEDIA_TYPE = "application/graphql-response+json";

function baseHeaders(rate?: RateVerdict<RateBucket>): Headers {
    const headers = new Headers();

    for (const [name, value] of SECURITY_HEADERS) {
        headers.set(name, value);
    }

    if (rate !== undefined) {
        applyRateHeaders(headers, rate);
    }

    return headers;
}

/**
 * A refusal shaped like a GraphQL response.
 *
 * `{ errors: [...] }` rather than this site's REST error envelope, because a
 * GraphQL client parses the body it receives and a bespoke shape is one its
 * error handler cannot see. `extensions.code` is the conventional place clients
 * look for a machine-readable reason.
 */
function problem(status: number, code: string, message: string, extra?: Headers): Response {
    const headers = extra ?? baseHeaders();

    headers.set("content-type", "application/json; charset=utf-8");

    return new Response(
        JSON.stringify({ errors: [{ message, extensions: { code: code.toUpperCase() } }] }),
        { status, headers },
    );
}

function applyRateHeaders(headers: Headers, rate: RateVerdict<RateBucket>): void {
    headers.set("x-ratelimit-limit", String(rate.limit));
    headers.set("x-ratelimit-remaining", String(rate.remaining));
    headers.set("x-ratelimit-reset", String(rate.resetsAt));
}

export async function handleGraphqlRequest(
    request: Request,
    target: { readonly serverKey: string },
): Promise<Response> {
    const method = request.method.toUpperCase();

    if (method !== "GET" && method !== "POST" && method !== "OPTIONS") {
        return problem(
            405,
            "method_not_allowed",
            "This endpoint speaks GET, POST and OPTIONS. GraphQL carries its own verbs in the query document.",
        );
    }

    // Shape before storage, and before the counter.
    const key = checkServerKey(target.serverKey);

    if (!key.ok) {
        return problem(404, "not_found", "No server answers at this address.");
    }

    if (method === "OPTIONS") {
        // A preflight, answered from the static header set. Deliberately before
        // the rate limit: a browser sends one for every cross-origin POST, and
        // charging it against the caller's budget would halve it for no reason.
        return new Response(null, { status: 204, headers: baseHeaders() });
    }

    // Read before the body is. A declared length past the ceiling is refused
    // without buffering anything, which is the only order that actually protects
    // the process — a body read first and measured afterwards is a gigabyte
    // already in memory.
    const declared = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
        return problem(413, "payload_too_large", "The request body is too large.");
    }

    // An unreadable address is not a reason to skip the limit: everything behind
    // one opaque proxy shares a bucket, which is worse for them and no gap at
    // all. The alternative is an unmetered path reachable by stripping a header.
    const limit = await spendServeQuota(resolveRemoteIp(request.headers) ?? "unknown", key.key);

    if (limit === null) {
        // The limiter could not run. It fails closed, because an unmetered
        // public path that stores what is mutated into it is free hosting for a
        // stranger's data — and in practice a database this cannot reach is one
        // that has no document to serve either.
        return problem(503, "unavailable", "This endpoint is temporarily unavailable.");
    }

    if (!limit.verdict.allowed) {
        const headers = baseHeaders();

        applyRateHeaders(headers, limit.verdict);
        headers.set("retry-after", String(limit.verdict.retryAfterSeconds));

        // Deliberately not logged. A runaway loop that filled the request log
        // with its own refusals would push the operations that matter out of the
        // fifty-row retention, which is the one place its author would look.
        return problem(429, "rate_limited", "Too many requests. Slow down.", headers);
    }

    const parsed = await readRequest(request, method);

    if (!parsed.ok) {
        return problem(400, parsed.reason, parsed.message, baseHeaders(limit.verdict));
    }

    const result = await serveGraphqlRequest(key.key, parsed.request);

    // Only when a fresh window opened — at most once a minute per active
    // server, off the response path, and usually deleting nothing.
    if (limit.windowOpened) {
        after(sweepQuotaRows());
    }

    if (result.kind === "not_found") {
        return problem(
            404,
            "not_found",
            "No server answers at this address.",
            baseHeaders(limit.verdict),
        );
    }

    if (result.kind === "unavailable") {
        return problem(
            503,
            "unavailable",
            "This endpoint is temporarily unavailable.",
            baseHeaders(limit.verdict),
        );
    }

    if (result.kind === "paused") {
        return problem(
            503,
            "server_paused",
            "This server is paused by its owner.",
            baseHeaders(limit.verdict),
        );
    }

    const headers = baseHeaders(limit.verdict);

    headers.set("content-type", `${mediaTypeFor(request)}; charset=utf-8`);
    headers.set("x-graphql-cost", String(result.outcome.cost));
    headers.set("x-graphql-depth", String(result.outcome.depth));

    // Written after the response is finished, so the API answers at the same
    // speed whether logging is on or not.
    after(
        writeRequestLog({
            serverId: result.serverId,
            operationName: result.outcome.operationName,
            operationType: result.operationType,
            status: result.outcome.status,
            durationMs: result.durationMs,
            cost: result.outcome.cost,
        }),
    );

    return new Response(result.outcome.body, { status: result.outcome.status, headers });
}

type ParsedRequest =
    | { readonly ok: true; readonly request: GraphqlRequest }
    | { readonly ok: false; readonly reason: string; readonly message: string };

/**
 * The request, read from whichever transport carried it.
 *
 * `GET` takes `?query=`, `?variables=` and `?operationName=`, which is what
 * makes a read shareable as a link and what `curl` reaches for first. `POST`
 * takes a JSON body. Both produce the same `GraphqlRequest`, and the one field
 * that differs is `allowMutation` — the transport's rights, carried with the
 * request rather than decided later.
 */
async function readRequest(request: Request, method: string): Promise<ParsedRequest> {
    if (method === "GET") {
        const url = new URL(request.url);
        const variables = url.searchParams.get("variables");

        let parsedVariables: Record<string, unknown> | null = null;

        if (variables !== null && variables.trim().length > 0) {
            try {
                parsedVariables = JSON.parse(variables) as Record<string, unknown>;
            } catch {
                return {
                    ok: false,
                    reason: "invalid_json_body",
                    message: "The `variables` parameter is not valid JSON.",
                };
            }
        }

        return {
            ok: true,
            request: {
                query: url.searchParams.get("query") ?? "",
                variables: parsedVariables,
                operationName: url.searchParams.get("operationName"),
                allowMutation: false,
            },
        };
    }

    const text = await request.text();

    // Measured again after reading, because `content-length` is a claim and a
    // chunked request carries none at all.
    if (text.length > MAX_UPLOAD_BYTES) {
        return {
            ok: false,
            reason: "payload_too_large",
            message: "The request body is too large.",
        };
    }

    let body: unknown;

    try {
        body = JSON.parse(text);
    } catch {
        return {
            ok: false,
            reason: "invalid_json_body",
            // `JSON.parse`'s own message is host-derived — V8 and
            // JavaScriptCore word it differently — so it is never rendered. The
            // same rule the BSON tool follows.
            message: "The request body is not valid JSON.",
        };
    }

    if (Array.isArray(body)) {
        return {
            ok: false,
            reason: "batching_unsupported",
            message:
                "Operation batching is not supported: an array body is N documents inside one rate-limited request. Send them as separate requests.",
        };
    }

    if (typeof body !== "object" || body === null) {
        return {
            ok: false,
            reason: "body_not_an_object",
            message: "The request body must be a JSON object with a `query` field.",
        };
    }

    const shape = body as Record<string, unknown>;

    if (typeof shape.query !== "string") {
        return {
            ok: false,
            reason: "missing_query",
            message: "The request body must carry a `query` string.",
        };
    }

    return {
        ok: true,
        request: {
            query: shape.query,
            variables:
                typeof shape.variables === "object" && shape.variables !== null
                    ? (shape.variables as Record<string, unknown>)
                    : null,
            operationName: typeof shape.operationName === "string" ? shape.operationName : null,
            allowMutation: true,
        },
    };
}

function mediaTypeFor(request: Request): string {
    return (request.headers.get("accept") ?? "").includes(SPEC_MEDIA_TYPE)
        ? SPEC_MEDIA_TYPE
        : "application/json";
}
