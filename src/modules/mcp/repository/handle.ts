import "server-only";

import { after } from "next/server";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import type { RateVerdict } from "@/modules/tools/domain/rate-window";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import { readBearerToken } from "../domain/access";
import { MAX_MCP_BODY_BYTES } from "../domain/constants";
import type { McpRateBucket } from "../domain/rate-limit";
import { spendMcpQuota, sweepMcpQuotaRows } from "./rate-limit";
import { buildMcpServer } from "./server";

/**
 * Where an MCP client is answered.
 *
 * A Route Handler, and the fifth in this repository where that is the right
 * call: the caller is somebody else's program, there is no UI to render, and
 * what it needs is a real HTTP response carrying status and headers a page
 * cannot set. Its relatives at `/j/[serverKey]`, `/m/[serverKey]`, `/q/[slug]`
 * and `/s/[slug]` follow the same rule.
 *
 * **Stateless.** No session id is issued, so every request stands alone. That
 * is not a simplification — it is the only design that survives serverless: a
 * session held in one instance's memory is gone when that instance is recycled,
 * and a client holding its id would get a 404 mid-conversation. The cost is
 * that server-initiated notifications are impossible, which costs nothing here
 * because nothing this server does is asynchronous to the caller.
 *
 * Every header below is deliberate:
 *
 * - **`Access-Control-Allow-Origin: *`.** A browser-based client — claude.ai,
 *   ChatGPT's connector UI — calls this from its own origin. Permissive by
 *   design and safe here because there is nothing to authenticate against with
 *   a cookie: the only credential is a bearer token the caller sends
 *   deliberately, and no cookie of ours is readable from this path.
 * - **`X-Content-Type-Options: nosniff`** and **`Content-Security-Policy:
 *   sandbox`.** Tool results carry text the caller supplied — a QR code's SVG,
 *   a decoded payload — and a browser must never decide for itself that any of
 *   it is HTML to run.
 * - **`X-Robots-Tag: noindex, nofollow`.** A JSON-RPC endpoint is not content.
 * - **`Cache-Control: no-store`.** Half these tools mint fresh randomness; a
 *   cached password would be the worst possible bug on this site.
 *
 * The gates run cheapest-first:
 *
 * 1. **Method** — a string comparison. `GET` and `DELETE` are answered without
 *    touching anything, because a stateless server has no stream to open and no
 *    session to end.
 * 2. **Declared body size** — a header read. An oversized body is refused
 *    before it is buffered, which is the one gate that must come before the
 *    thing it protects rather than after.
 * 3. **Parse** — one `json()`, reused by the transport via `parsedBody` so the
 *    body is never read twice.
 * 4. **The rate limit** — the first statement that touches Postgres, and the
 *    only gate that bounds volume. Everything above refuses one bad request;
 *    this refuses the ten-thousandth good one.
 * 5. **The tool** — where the token gate lives, per tool, in `server.ts`.
 */

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
    ["x-robots-tag", "noindex, nofollow"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["cache-control", "no-store"],
    ["content-security-policy", "sandbox"],
    ["access-control-allow-origin", "*"],
    ["access-control-allow-methods", "GET, POST, DELETE, OPTIONS"],
    [
        "access-control-allow-headers",
        "content-type, authorization, mcp-protocol-version, mcp-session-id, last-event-id",
    ],
    ["access-control-expose-headers", "mcp-session-id, x-ratelimit-remaining, x-ratelimit-reset"],
    ["access-control-max-age", "86400"],
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
 * A refusal in the JSON-RPC shape, so a client renders it as a protocol error
 * rather than as a broken connection.
 *
 * `id: null` because a request refused before it was parsed has no id to echo,
 * and JSON-RPC says an unattributable error carries a null one. The codes are
 * the transport's own: `-32600` for a malformed request, `-32000` for a server
 * refusal that is not about the shape of the message.
 */
function problem(status: number, code: number, message: string, extra?: Headers): Response {
    const headers = extra ?? baseHeaders();
    headers.set("content-type", "application/json");

    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
        status,
        headers,
    });
}

function applyRateHeaders(headers: Headers, rate: RateVerdict<McpRateBucket>): void {
    headers.set("x-ratelimit-limit", String(rate.limit));
    headers.set("x-ratelimit-remaining", String(rate.remaining));
    headers.set("x-ratelimit-reset", String(rate.resetsAt));
}

/**
 * What the counter is keyed on.
 *
 * A `tools/call` is metered under the tool it names, so a flood aimed at RSA
 * generation cannot exhaust the budget for `tools/list`. Everything else is
 * metered under its method — `initialize` and `tools/list` are cheap, but they
 * are not free, and an unmetered handshake is still a way to make this server
 * work for nothing.
 *
 * The message shape is read defensively rather than validated: an unparseable
 * body still has to be counted, or sending rubbish would be the cheapest way to
 * bypass the limiter entirely.
 */
function meteredName(body: unknown): string {
    if (typeof body !== "object" || body === null) {
        return "malformed";
    }

    const message = body as { method?: unknown; params?: { name?: unknown } };

    if (message.method === "tools/call" && typeof message.params?.name === "string") {
        return message.params.name;
    }

    return typeof message.method === "string" ? message.method : "malformed";
}

export async function handleMcpRequest(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: baseHeaders() });
    }

    // A stateless server has no standalone stream to open and no session to
    // delete. Both are answered here rather than by the transport so the reply
    // carries this file's headers and says which methods do work.
    if (method === "GET" || method === "DELETE") {
        return problem(405, -32601, "This MCP endpoint is stateless; use POST.");
    }

    if (method !== "POST") {
        return problem(405, -32601, "Only POST, GET, DELETE and OPTIONS are accepted.");
    }

    const declared = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(declared) && declared > MAX_MCP_BODY_BYTES) {
        return problem(413, -32600, "Request body is too large.");
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return problem(400, -32700, "Request body is not valid JSON.");
    }

    const address = resolveRemoteIp(request.headers) ?? "unknown";
    const spend = await spendMcpQuota(address, meteredName(body));

    // `null` means the limiter could not run. See `rate-limit.ts`: an unmetered
    // endpoint that will generate 4096-bit keys on demand is not something to
    // leave open because a variable is blank.
    if (spend === null) {
        return problem(
            503,
            -32000,
            "The MCP endpoint is not configured on this deployment: it needs a database and MCP_IP_SALT to meter callers.",
        );
    }

    if (!spend.verdict.allowed) {
        const headers = baseHeaders();
        applyRateHeaders(headers, spend.verdict);
        headers.set("retry-after", String(spend.verdict.retryAfterSeconds));

        return problem(429, -32000, "Rate limit exceeded.", headers);
    }

    if (spend.windowOpened) {
        // Cheap, and only when a fresh window opened, so the sweep runs at
        // roughly the rate rows are created rather than on every request.
        after(async () => {
            await sweepMcpQuotaRows();
        });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        // A plain JSON reply rather than an SSE stream. Nothing here streams —
        // every tool returns one result — and a single JSON body is what the
        // widest set of clients handles without special cases.
        enableJsonResponse: true,
    });

    const server = buildMcpServer(readBearerToken(request.headers.get("authorization")));

    try {
        await server.connect(transport);

        const response = await transport.handleRequest(request, { parsedBody: body });

        // Buffered before the server is closed, deliberately. Closing cancels
        // the transport's stream, and handing a cancelled stream back as the
        // response body truncates it — a class of bug that only appears under
        // load, when the close wins the race. `enableJsonResponse` means this
        // is one small JSON object, so buffering costs nothing.
        const text = await response.text();
        const headers = new Headers(response.headers);

        for (const [name, value] of SECURITY_HEADERS) {
            headers.set(name, value);
        }

        applyRateHeaders(headers, spend.verdict);

        return new Response(text, { status: response.status, headers });
    } catch (error) {
        logEvent("error", "mcp.request_failed", { detail: describeError(error) });

        return problem(500, -32603, "Internal error.");
    } finally {
        // Per-request server: closing it is what makes statelessness true
        // rather than merely claimed. It closes the transport with it.
        await server.close();
    }
}
