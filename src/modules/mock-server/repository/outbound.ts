import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { guardAddresses } from "@/modules/tools/repository/address-guard";

import {
    checkOutboundUrl,
    MAX_OUTBOUND_REDIRECTS,
    MAX_OUTBOUND_RESPONSE_BYTES,
    OUTBOUND_CONNECT_TIMEOUT_MS,
    OUTBOUND_TOTAL_TIMEOUT_MS,
    pickResponseHeaders,
    sanitizeOutboundHeaders,
    type OutboundProblem,
    type OutboundResult,
} from "../domain/outbound";
import type { JsonValue } from "../types/graph";

/**
 * A request to a host a graph's author chose.
 *
 * The most dangerous function in this repository, and it follows the rules the
 * Domain Inspector established for exactly this shape of problem:
 *
 * **Resolve first, then connect to the address you checked.** Checking the name
 * proves nothing — `metadata.attacker.example` is a perfectly public name that
 * resolves to `169.254.169.254`. And checking a name's addresses and then
 * connecting *by name* re-resolves it, so a record with a one-second TTL can
 * answer publicly for the check and privately for the connection. This is why
 * `fetch` is not used: it cannot be told which address to connect to.
 * `node:https` can, through `lookup`.
 *
 * **Every redirect hop is a new host and a new decision.** Following them
 * automatically hands the destination to whoever wrote the `Location` header.
 * Each is re-checked, re-resolved and re-guarded.
 *
 * **The body is capped while it streams**, not after. Reading a response into
 * memory and then measuring it is how a four-gigabyte reply kills the process.
 */

export type OutboundFetch =
    | { readonly ok: true; readonly result: OutboundResult }
    | { readonly ok: false; readonly reason: OutboundProblem };

export type OutboundRequest = {
    readonly url: string;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string | null;
};

export async function guardedFetch(input: OutboundRequest): Promise<OutboundFetch> {
    let target = input.url;

    for (let hop = 0; hop <= MAX_OUTBOUND_REDIRECTS; hop += 1) {
        const checked = checkOutboundUrl(target);

        if (!checked.ok) {
            return { ok: false, reason: checked.reason };
        }

        const resolved = await resolveGuarded(checked.url.hostname);

        if (resolved === null) {
            return { ok: false, reason: "blocked_address" };
        }

        // Only the first hop carries the body: a 301 on a POST is followed as a
        // GET by every real client, and re-sending a body to a new host the
        // author did not name is exactly what should not happen.
        const hopResult = await sendOnce(
            checked.url,
            resolved,
            hop === 0 ? input.method : "GET",
            input.headers,
            hop === 0 ? input.body : null,
        );

        if (!hopResult.ok) {
            return hopResult;
        }

        const { status, location } = hopResult;

        if (status >= 300 && status < 400 && location !== undefined) {
            // Resolved against the current URL so a relative `Location` works,
            // and then run through the whole check again from the top.
            target = new URL(location, checked.url).toString();
            continue;
        }

        return { ok: true, result: hopResult.result };
    }

    return { ok: false, reason: "too_many_redirects" };
}

/** The addresses a name answers with, minus everything the guard refuses. */
async function resolveGuarded(
    hostname: string,
): Promise<{ address: string; family: 4 | 6 } | null> {
    try {
        const answers = await lookup(hostname, { all: true, verbatim: true });
        const guard = guardAddresses(
            answers.map((answer) => answer.address),
            "mock_server",
        );

        if (!guard.ok) {
            return null;
        }

        const chosen = answers.find((answer) => guard.addresses.includes(answer.address));

        return chosen === undefined
            ? null
            : { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
    } catch (caught) {
        logEvent("warn", "mock_server.outbound_resolve_failed", { error: describeError(caught) });

        return null;
    }
}

type HopOutcome =
    | {
          readonly ok: true;
          readonly status: number;
          readonly location: string | undefined;
          readonly result: OutboundResult;
      }
    | { readonly ok: false; readonly reason: OutboundProblem };

function sendOnce(
    url: URL,
    resolved: { address: string; family: 4 | 6 },
    method: string,
    headers: Readonly<Record<string, string>>,
    body: string | null,
): Promise<HopOutcome> {
    return new Promise((resolve) => {
        const send = url.protocol === "https:" ? httpsRequest : httpRequest;
        let settled = false;

        function finish(outcome: HopOutcome) {
            if (!settled) {
                settled = true;
                resolve(outcome);
            }
        }

        const request = send(
            {
                protocol: url.protocol,
                // The address, never the hostname — re-resolving here would hand
                // the decision back to whoever controls the record.
                host: resolved.address,
                family: resolved.family,
                port: url.port === "" ? undefined : Number(url.port),
                path: `${url.pathname}${url.search}`,
                method,
                headers: {
                    ...sanitizeOutboundHeaders(headers),
                    // Set here rather than forwarded, so the far end sees the
                    // name it was addressed by while the socket goes to the
                    // address that was checked. TLS needs `servername` for the
                    // same reason.
                    host: url.host,
                    "user-agent": "ToolForge-MockServer/1.0",
                },
                servername: url.protocol === "https:" ? url.hostname : undefined,
                timeout: OUTBOUND_CONNECT_TIMEOUT_MS,
                // Nothing here should ever reach a resolver again.
                lookup: (_hostname, _options, callback) => {
                    callback(null, resolved.address, resolved.family);
                },
            },
            (response) => {
                const chunks: Buffer[] = [];
                let received = 0;
                let truncated = false;

                response.on("data", (chunk: Buffer) => {
                    // Capped while it streams. Reading it all and measuring
                    // afterwards is how a four-gigabyte reply kills a process.
                    if (received >= MAX_OUTBOUND_RESPONSE_BYTES) {
                        truncated = true;
                        response.destroy();

                        return;
                    }

                    received += chunk.length;
                    chunks.push(chunk);
                });

                response.on("end", () => {
                    const text = Buffer.concat(chunks)
                        .subarray(0, MAX_OUTBOUND_RESPONSE_BYTES)
                        .toString("utf8");

                    finish({
                        ok: true,
                        status: response.statusCode ?? 0,
                        location: response.headers.location,
                        result: {
                            status: response.statusCode ?? 0,
                            headers: pickResponseHeaders(
                                Object.fromEntries(
                                    Object.entries(response.headers).map(([name, value]) => [
                                        name,
                                        Array.isArray(value) ? value.join(", ") : (value ?? ""),
                                    ]),
                                ),
                            ),
                            body: parseBody(text, response.headers["content-type"] ?? ""),
                            truncated,
                        },
                    });
                });

                response.on("close", () => {
                    // A destroyed stream never emits `end`, so the truncated
                    // case has to settle here or the promise would hang.
                    if (truncated) {
                        finish({
                            ok: true,
                            status: response.statusCode ?? 0,
                            location: undefined,
                            result: {
                                status: response.statusCode ?? 0,
                                headers: {},
                                body: Buffer.concat(chunks).toString("utf8"),
                                truncated: true,
                            },
                        });
                    }
                });
            },
        );

        const deadline = setTimeout(() => {
            request.destroy();
            finish({ ok: false, reason: "timed_out" });
        }, OUTBOUND_TOTAL_TIMEOUT_MS);

        request.on("timeout", () => {
            request.destroy();
            finish({ ok: false, reason: "timed_out" });
        });

        request.on("error", (caught) => {
            logEvent("warn", "mock_server.outbound_failed", { error: describeError(caught) });
            finish({ ok: false, reason: "upstream_failed" });
        });

        request.on("close", () => clearTimeout(deadline));

        if (body !== null && body !== "") {
            request.write(body);
        }

        request.end();
    });
}

function parseBody(text: string, contentType: string): JsonValue {
    if (!contentType.includes("json")) {
        return text;
    }

    try {
        return JSON.parse(text) as JsonValue;
    } catch {
        return text;
    }
}
