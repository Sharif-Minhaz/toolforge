import "server-only";

import { after } from "next/server";

import { buildLoggedRequest, buildLoggedResponse } from "../domain/log-record";
import type { RateVerdict } from "../domain/rate-limit";
import { isMultipartType, parseRequestBody } from "../domain/request-body";
import { checkServerKey } from "../domain/server-key";
import { writeRequestLog } from "./logs";
import { spendServeQuota, sweepQuotaRows } from "./rate-limit";
import { serveMockRequest, type ServeOutcome } from "./serve";
import { HTTP_METHODS, type HttpMethod } from "../types/graph";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

/**
 * Where a mock endpoint actually answers.
 *
 * A Route Handler rather than a page, and the third in this repository where
 * that is the right call: the client is somebody else's program, there is no UI
 * to render, and what it needs is a real HTTP response carrying headers and a
 * status a page cannot set. Its relatives at `/q/[slug]` and `/s/[slug]` follow
 * the same rule.
 *
 * Every header below is deliberate, and while the studio shares this origin
 * with the rest of ToolForge — see `docs/mock-server-studio.md` §4.1 — several
 * of them are load-bearing rather than tidy:
 *
 * - **`Content-Security-Policy: sandbox`** and **`X-Content-Type-Options:
 *   nosniff`.** The response body is written by a stranger. Sandboxing denies
 *   it an origin even if a content type slipped through, and `nosniff` stops a
 *   browser deciding for itself that some JSON is really HTML.
 * - **`X-Robots-Tag: noindex, nofollow`.** A mock endpoint is not content this
 *   site is publishing, and its address should not accumulate search presence.
 * - **`Referrer-Policy: no-referrer`.** Whoever called the mock learns nothing
 *   about where the call came from.
 * - **`Cache-Control: no-store`.** A mock is edited constantly, and a cached
 *   copy of the previous version is the single most confusing thing this could
 *   hand somebody mid-debugging.
 * - **`Access-Control-Allow-Origin: *`.** The point of a mock is that a
 *   front-end running on localhost can call it. Permissive by design and safe
 *   here because there is nothing to authenticate against — no cookie of ours
 *   is readable from this path, and none is sent.
 *
 * This is also the one route on the site a stranger's program calls in a loop,
 * so it is the one that carries a throughput limit. The gates run cheapest-first
 * for the usual reason:
 *
 * 1. **Method**, then **key shape** — a regular expression each. A scripted walk
 *    of the keyspace and a request with a nonsense verb both cost no database
 *    work and no counter.
 * 2. **The rate limit** — the first statement that touches Postgres, and the
 *    only gate that bounds *volume*. Everything above refuses one bad request;
 *    this refuses the ten-thousandth good one.
 * 3. **Serving** — the server lookup, the route match, the graph, the log write.
 *    A refused request reaches none of it, which is the property that makes the
 *    limit worth having: a render loop calling this endpoint costs one indexed
 *    upsert, not an execution and a log row.
 *
 * `HEAD` and `OPTIONS` are counted too. A browser sends a preflight before each
 * cross-origin call, so counting them halves the effective budget for that
 * caller — accepted deliberately, because the alternative is a verb that reaches
 * the database unmetered.
 */

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
    ["x-robots-tag", "noindex, nofollow"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["cache-control", "no-store"],
    ["content-security-policy", "sandbox"],
    ["access-control-allow-origin", "*"],
    ["access-control-allow-headers", "*"],
    ["vary", "origin"],
];

function baseHeaders(rate?: RateVerdict): Headers {
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
 * A refusal in the same JSON shape every time, so a caller debugging an
 * integration can tell a ToolForge answer from their mock's own.
 */
function problem(status: number, code: string, extra?: Headers): Response {
    const headers = extra ?? baseHeaders();
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-mock-error", code);

    return new Response(JSON.stringify({ error: code, status }), { status, headers });
}

/**
 * The caller's own budget, written onto every answer rather than only onto a
 * refusal.
 *
 * A developer watching the network tab sees the remainder counting down before
 * anything breaks, which is the difference between "my mock stopped working"
 * and "my component is calling it in a loop". The numbers describe the caller to
 * themselves and nobody else, so there is nothing here to withhold.
 */
function applyRateHeaders(headers: Headers, rate: RateVerdict): void {
    headers.set("x-ratelimit-limit", String(rate.limit));
    headers.set("x-ratelimit-remaining", String(rate.remaining));
    headers.set("x-ratelimit-reset", String(rate.resetsAt));
}

function toResponse(outcome: ServeOutcome, method: HttpMethod, rate: RateVerdict): Response {
    switch (outcome.kind) {
        case "response": {
            const headers = baseHeaders(rate);

            for (const row of outcome.response.headers) {
                // Author-supplied headers are set after the security set, but a
                // `set` on the same name would let one of them be overwritten —
                // so the security names are re-applied below.
                headers.set(row.name, row.value);
            }

            for (const [name, value] of SECURITY_HEADERS) {
                headers.set(name, value);
            }

            // Re-applied for the same reason as the security set: a graph's own
            // `X-RateLimit-Remaining` must not be able to overwrite the real one.
            applyRateHeaders(headers, rate);

            headers.set("x-mock-endpoint", outcome.endpointId);
            // Echoed so a caller who liked what they got can pin it: send the
            // same value back as `X-Mock-Seed` and the response repeats exactly.
            headers.set("x-mock-seed", outcome.seed);

            return new Response(method === "HEAD" ? null : outcome.response.body, {
                status: outcome.response.status,
                headers,
            });
        }

        case "method_not_allowed": {
            const headers = baseHeaders(rate);
            headers.set("allow", outcome.allowed.join(", "));

            return problem(405, "method_not_allowed", headers);
        }

        case "options": {
            // A preflight nobody defined, answered from what the path supports.
            const headers = baseHeaders(rate);
            headers.set("allow", outcome.allowed.join(", "));
            headers.set("access-control-allow-methods", outcome.allowed.join(", "));

            return new Response(null, { status: 204, headers });
        }

        case "paused":
            return problem(503, "server_paused", baseHeaders(rate));

        case "unavailable":
            return problem(503, "unavailable", baseHeaders(rate));

        case "failed":
            // The endpoint matched and its graph could not answer. 500 is the
            // honest status: the mock is broken, not the request.
            return problem(500, outcome.reason, baseHeaders(rate));

        default:
            return problem(404, "not_found", baseHeaders(rate));
    }
}

export async function handleMockRequest(
    request: Request,
    target: { readonly serverKey: string; readonly path: string },
): Promise<Response> {
    const { serverKey, path } = target;
    const method = request.method.toUpperCase();

    if (!(HTTP_METHODS as readonly string[]).includes(method)) {
        return problem(405, "method_not_allowed");
    }

    // Shape before storage, and before the counter. A key that could never have
    // been stored costs a regular expression rather than a round trip — the same
    // check `serveMockRequest` makes for itself, repeated here only so the
    // limiter is not the thing a keyspace walk hammers.
    const key = checkServerKey(serverKey);

    if (!key.ok) {
        return problem(404, "not_found");
    }

    // An unreadable address is not a reason to skip the limit: everything behind
    // one opaque proxy shares a bucket, which is worse for them and no gap at
    // all. The alternative is an unmetered path reachable by stripping a header.
    const limit = await spendServeQuota(resolveRemoteIp(request.headers) ?? "unknown", key.key);

    if (limit === null) {
        // The limiter could not run. It fails closed, because an unmetered
        // public execution path is a free, scriptable way to spend this
        // deployment's function budget — and in practice a database this cannot
        // reach is one that has no endpoint to serve either.
        return problem(503, "unavailable");
    }

    if (!limit.verdict.allowed) {
        const headers = baseHeaders();
        applyRateHeaders(headers, limit.verdict);
        headers.set("retry-after", String(limit.verdict.retryAfterSeconds));

        // Deliberately not logged. A runaway loop that filled the request log
        // with its own refusals would push the calls that matter out of the
        // 500-row retention, which is the one place its author would look.
        return problem(429, "rate_limited", headers);
    }

    const url = new URL(request.url);

    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    const rawBody =
        method === "GET" || method === "HEAD"
            ? ""
            : await readBody(request, headers["content-type"]);
    const requestPath = path;

    const outcome = await serveMockRequest({
        serverKey,
        method: method as HttpMethod,
        path: requestPath,
        query,
        headers,
        cookies: readCookies(request.headers.get("cookie")),
        rawBody,
    });

    const response = toResponse(outcome, method as HttpMethod, limit.verdict);

    // Only when a fresh window opened — at most once a minute per active
    // server, off the response path, and usually deleting nothing.
    if (limit.windowOpened) {
        after(sweepQuotaRows());
    }

    // Written after the response is finished, so a mock answers at the same
    // speed whether logging is on or not — and a briefly slow database costs
    // the caller nothing.
    if (outcome.kind === "response" || outcome.kind === "failed") {
        const status = outcome.kind === "response" ? outcome.response.status : 500;
        const { workspaceId, serverId, endpointId, trace, durationMs } = outcome;
        const responseHeaders = outcome.kind === "response" ? outcome.response.headers : [];
        const responseBody = outcome.kind === "response" ? outcome.response.body : "";

        after(async () => {
            await writeRequestLog({
                workspaceId,
                serverId,
                endpointId,
                method,
                path: requestPath,
                status,
                durationMs,
                // Redacted here, on the way in — never filtered on the way out.
                // A read-path filter is one forgotten query from leaking, and it
                // does nothing about the copy already on disk.
                // The *parsed* body, never the wire bytes. For an upload those
                // bytes are the start of somebody's file, and the log keeps
                // 8 KB of whatever it is handed — so logging them would mean
                // this service stores a slice of every file posted to it, which
                // is precisely what it promises not to do. What goes in instead
                // is what the graph saw: field names, field values, and each
                // file's name, type and size.
                request: buildLoggedRequest(headers, query, loggableBody(rawBody, headers), false),
                response: buildLoggedResponse(responseHeaders, responseBody, false),
                trace,
            });
        });
    }

    return response;
}

/**
 * The body, as text for everything except an upload.
 *
 * `request.text()` decodes UTF-8, and a PNG is not UTF-8 — every invalid
 * sequence in it becomes U+FFFD, so the bytes that reach the parser bear no
 * relation to the bytes that arrived and neither does any size counted from
 * them. A multipart body is therefore read as bytes and mapped one-to-one onto
 * characters, which keeps `size` exact and leaves the boundary and part headers
 * legible because both are ASCII. `parseRequestBody` decodes the text fields
 * back. See `domain/request-body.ts`.
 */
/** An upload is logged as what it parsed to; everything else as it arrived. */
function loggableBody(rawBody: string, headers: Readonly<Record<string, string>>): string {
    const contentType = headers["content-type"] ?? "";

    return isMultipartType(contentType)
        ? JSON.stringify(parseRequestBody(rawBody, contentType))
        : rawBody;
}

async function readBody(request: Request, contentType: string | undefined): Promise<string> {
    if (!isMultipartType(contentType ?? "")) {
        return request.text();
    }

    return Buffer.from(await request.arrayBuffer()).toString("latin1");
}

function readCookies(header: string | null): Readonly<Record<string, string>> {
    if (!header) {
        return {};
    }

    const jar: Record<string, string> = {};

    for (const pair of header.split(";")) {
        const index = pair.indexOf("=");

        if (index > 0) {
            jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
        }
    }

    return jar;
}
