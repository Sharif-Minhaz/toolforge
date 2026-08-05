import { after } from "next/server";

import { buildLoggedRequest, buildLoggedResponse } from "@/modules/mock-server/domain/log-record";
import { writeRequestLog } from "@/modules/mock-server/repository/logs";
import { serveMockRequest, type ServeOutcome } from "@/modules/mock-server/repository/serve";
import { HTTP_METHODS, type HttpMethod } from "@/modules/mock-server/types/graph";

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
 */

/** Every request must reach the database, or a just-saved endpoint serves stale. */
export const dynamic = "force-dynamic";

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

function baseHeaders(): Headers {
    const headers = new Headers();

    for (const [name, value] of SECURITY_HEADERS) {
        headers.set(name, value);
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

function toResponse(outcome: ServeOutcome, method: HttpMethod): Response {
    switch (outcome.kind) {
        case "response": {
            const headers = baseHeaders();

            for (const row of outcome.response.headers) {
                // Author-supplied headers are set after the security set, but a
                // `set` on the same name would let one of them be overwritten —
                // so the security names are re-applied below.
                headers.set(row.name, row.value);
            }

            for (const [name, value] of SECURITY_HEADERS) {
                headers.set(name, value);
            }

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
            const headers = baseHeaders();
            headers.set("allow", outcome.allowed.join(", "));

            return problem(405, "method_not_allowed", headers);
        }

        case "options": {
            // A preflight nobody defined, answered from what the path supports.
            const headers = baseHeaders();
            headers.set("allow", outcome.allowed.join(", "));
            headers.set("access-control-allow-methods", outcome.allowed.join(", "));

            return new Response(null, { status: 204, headers });
        }

        case "paused":
            return problem(503, "server_paused");

        case "unavailable":
            return problem(503, "unavailable");

        case "failed":
            // The endpoint matched and its graph could not answer. 500 is the
            // honest status: the mock is broken, not the request.
            return problem(500, outcome.reason);

        default:
            return problem(404, "not_found");
    }
}

async function handle(request: Request, context: RouteContext): Promise<Response> {
    const { serverKey, path } = await context.params;
    const method = request.method.toUpperCase();

    if (!(HTTP_METHODS as readonly string[]).includes(method)) {
        return problem(405, "method_not_allowed");
    }

    const url = new URL(request.url);

    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    const rawBody = method === "GET" || method === "HEAD" ? "" : await request.text();
    const requestPath = `/${(path ?? []).join("/")}`;

    const outcome = await serveMockRequest({
        serverKey,
        method: method as HttpMethod,
        path: requestPath,
        query,
        headers,
        cookies: readCookies(request.headers.get("cookie")),
        rawBody,
    });

    const response = toResponse(outcome, method as HttpMethod);

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
                request: buildLoggedRequest(headers, query, rawBody, false),
                response: buildLoggedResponse(responseHeaders, responseBody, false),
                trace,
            });
        });
    }

    return response;
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

type RouteContext = {
    params: Promise<{ serverKey: string; path?: string[] }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}
