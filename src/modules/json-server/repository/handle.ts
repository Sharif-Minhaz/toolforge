import "server-only";

import { after } from "next/server";

import type { RateVerdict } from "@/modules/tools/domain/rate-window";
import { checkServerKey } from "@/modules/tools/domain/server-key";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import { MAX_UPLOAD_BYTES } from "../domain/constants";
import type { RateBucket } from "../domain/rate-limit";
import { writeRequestLog } from "./logs";
import { spendServeQuota, sweepQuotaRows } from "./rate-limit";
import { serveJsonRequest } from "./serve";
import { HTTP_METHODS, type HttpMethod } from "../types";

/**
 * Where a JSON server actually answers.
 *
 * A Route Handler rather than a page, and the fourth in this repository where
 * that is the right call: the client is somebody else's program, there is no UI
 * to render, and what it needs is a real HTTP response carrying headers and a
 * status a page cannot set. Its relatives at `/q/[slug]`, `/s/[slug]` and
 * `/m/[serverKey]` follow the same rule.
 *
 * Every header below is deliberate:
 *
 * - **`Content-Security-Policy: sandbox`** and **`X-Content-Type-Options:
 *   nosniff`.** The response body is somebody's stored data. Sandboxing denies
 *   it an origin, and `nosniff` stops a browser deciding for itself that some
 *   JSON is really HTML. Note that unlike the mock studio, the content type here
 *   is never author-chosen — this endpoint answers `application/json` and
 *   nothing else — so the allowlist that studio needs has no equivalent here.
 * - **`X-Robots-Tag: noindex, nofollow`.** A fixture API is not content this
 *   site is publishing, and its address should not accumulate search presence.
 * - **`Referrer-Policy: no-referrer`.** Whoever called it learns nothing about
 *   where the call came from.
 * - **`Cache-Control: no-store`.** The data changes on every write, and a cached
 *   copy of the previous version is the single most confusing thing this could
 *   hand somebody mid-debugging.
 * - **`Access-Control-Allow-Origin: *`.** The point is that a front end on
 *   localhost can call it. Permissive by design and safe here because there is
 *   nothing to authenticate against — no cookie of ours is readable from this
 *   path, and none is sent.
 *
 * The gates run cheapest-first:
 *
 * 1. **Method**, then **key shape** — a regular expression each. A scripted walk
 *    of the keyspace and a request with a nonsense verb both cost no database
 *    work and no counter.
 * 2. **Body size** — a header read. A gigabyte `POST` is refused before it is
 *    buffered into memory, which is the one gate that has to come before the
 *    thing it is protecting rather than after.
 * 3. **The rate limit** — the first statement that touches Postgres, and the
 *    only gate that bounds *volume*. Everything above refuses one bad request;
 *    this refuses the ten-thousandth good one.
 * 4. **Serving** — the row read, the engine, and the row lock if it writes.
 */

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
    ["x-robots-tag", "noindex, nofollow"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["cache-control", "no-store"],
    ["content-security-policy", "sandbox"],
    ["access-control-allow-origin", "*"],
    ["access-control-allow-headers", "*"],
    ["access-control-expose-headers", "x-total-count, location, x-ratelimit-remaining"],
    ["vary", "origin"],
];

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
 * A refusal in the same JSON shape the engine uses, so a caller debugging an
 * integration sees one error format whether the refusal came from the gate or
 * from the data.
 */
function problem(status: number, code: string, extra?: Headers): Response {
    const headers = extra ?? baseHeaders();
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-json-error", code);

    return new Response(JSON.stringify({ error: code, status }), { status, headers });
}

/**
 * The caller's own budget, written onto every answer rather than only onto a
 * refusal.
 *
 * A developer watching the network tab sees the remainder counting down before
 * anything breaks, which is the difference between "my API stopped working" and
 * "my component is calling it in a loop".
 */
function applyRateHeaders(headers: Headers, rate: RateVerdict<RateBucket>): void {
    headers.set("x-ratelimit-limit", String(rate.limit));
    headers.set("x-ratelimit-remaining", String(rate.remaining));
    headers.set("x-ratelimit-reset", String(rate.resetsAt));
}

export async function handleJsonRequest(
    request: Request,
    target: { readonly serverKey: string; readonly path: string },
): Promise<Response> {
    const { serverKey, path } = target;
    const method = request.method.toUpperCase();

    if (!(HTTP_METHODS as readonly string[]).includes(method)) {
        return problem(405, "method_not_allowed");
    }

    // Shape before storage, and before the counter. A key that could never have
    // been stored costs a regular expression rather than a round trip.
    const key = checkServerKey(serverKey);

    if (!key.ok) {
        return problem(404, "not_found");
    }

    // Read before the body is. A declared length past the ceiling is refused
    // without buffering anything, which is the only order that actually
    // protects the process — a body read first and measured afterwards is a
    // gigabyte already in memory.
    const declared = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
        return problem(413, "payload_too_large");
    }

    // An unreadable address is not a reason to skip the limit: everything behind
    // one opaque proxy shares a bucket, which is worse for them and no gap at
    // all. The alternative is an unmetered path reachable by stripping a header.
    const limit = await spendServeQuota(resolveRemoteIp(request.headers) ?? "unknown", key.key);

    if (limit === null) {
        // The limiter could not run. It fails closed, because an unmetered
        // public path that stores what is posted to it is free hosting for a
        // stranger's data — and in practice a database this cannot reach is one
        // that has no document to serve either.
        return problem(503, "unavailable");
    }

    if (!limit.verdict.allowed) {
        const headers = baseHeaders();
        applyRateHeaders(headers, limit.verdict);
        headers.set("retry-after", String(limit.verdict.retryAfterSeconds));

        // Deliberately not logged. A runaway loop that filled the request log
        // with its own refusals would push the calls that matter out of the
        // fifty-row retention, which is the one place its author would look.
        return problem(429, "rate_limited", headers);
    }

    const url = new URL(request.url);
    const body =
        method === "GET" || method === "HEAD" || method === "OPTIONS" ? "" : await request.text();

    // Measured again after reading, because `content-length` is a claim and a
    // chunked request carries none at all.
    if (body.length > MAX_UPLOAD_BYTES) {
        return problem(413, "payload_too_large", baseHeaders(limit.verdict));
    }

    const outcome = await serveJsonRequest(key.key, {
        method: method as HttpMethod,
        path,
        // `entries()` keeps repeated keys, which `Object.fromEntries` would
        // collapse — and `?views:gt=10&views:lt=90` is a range that depends on
        // both surviving.
        query: [...url.searchParams.entries()],
        body,
    });

    // Only when a fresh window opened — at most once a minute per active
    // server, off the response path, and usually deleting nothing.
    if (limit.windowOpened) {
        after(sweepQuotaRows());
    }

    if (outcome.kind === "not_found") {
        return problem(404, "not_found", baseHeaders(limit.verdict));
    }

    if (outcome.kind === "unavailable") {
        return problem(503, "unavailable", baseHeaders(limit.verdict));
    }

    if (outcome.kind === "paused") {
        return problem(503, "server_paused", baseHeaders(limit.verdict));
    }

    const headers = baseHeaders(limit.verdict);

    for (const [name, value] of outcome.headers) {
        headers.set(name, value);
    }

    // 204 carries no body and no content type; anything else is JSON.
    if (outcome.status !== 204) {
        headers.set("content-type", "application/json; charset=utf-8");
    }

    // Written after the response is finished, so the API answers at the same
    // speed whether logging is on or not.
    after(
        writeRequestLog({
            serverId: outcome.serverId,
            method,
            path: url.search.length > 0 ? `${path}${url.search}` : path,
            status: outcome.status,
            durationMs: outcome.durationMs,
        }),
    );

    return new Response(method === "HEAD" || outcome.status === 204 ? null : outcome.body, {
        status: outcome.status,
        headers,
    });
}
