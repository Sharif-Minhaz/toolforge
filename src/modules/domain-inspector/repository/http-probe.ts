import "server-only";

import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import {
    HTTP_TIMEOUT_MS,
    MAX_HTML_BYTES,
    MAX_REDIRECT_HOPS,
    PROBE_USER_AGENT,
} from "../domain/constants";
import {
    gradeSecurityHeaders,
    readSecurityHeaders,
    toHeaderMap,
    type HeaderMap,
} from "../domain/headers";
import { readDeclaredLicense, readGenerator, readPageTitle } from "../domain/markup";
import { resolvePublicAddresses } from "./address-guard";
import type { DnsResolver, HttpHop, HttpReport, PanelResult } from "../types";

/**
 * One page fetch, done by hand rather than with `fetch`.
 *
 * `fetch` cannot be told which address to connect to, and that is exactly the
 * control this needs: every hop is resolved and checked first, then connected
 * to by address, so a name cannot answer with a public address for the check
 * and a private one for the connection. Redirects are followed manually for the
 * same reason — each `Location` is a new host, and a new host is a new decision.
 *
 * The certificate is deliberately not verified here. An expired certificate is
 * something the certificate panel reports, not a reason to refuse to look at
 * the page; nothing is sent that would be worth protecting.
 */

export type SiteProbe = {
    readonly report: HttpReport;
    /**
     * Every response header, lower-cased. The report keeps the handful it
     * renders; the matcher needs the rest — `cf-ray` and `x-vercel-id` are how
     * a CDN and a host are recognised, and neither is worth a field of its own.
     */
    readonly headers: HeaderMap;
    /** Capped, decompressed page source, for the fingerprint matcher. */
    readonly html: string;
    readonly generator: string | null;
    readonly cookieNames: readonly string[];
};

type Attempt = {
    readonly response: IncomingMessage;
    readonly url: URL;
};

function pinnedLookup(address: string, family: number) {
    // Node calls this with `{ all: true }` in some paths and expects an array
    // back in exactly those; answering with the wrong shape throws inside the
    // agent rather than here.
    return (
        _hostname: string,
        options: { all?: boolean },
        callback: (
            error: Error | null,
            addressOrList: string | { address: string; family: number }[],
            family?: number,
        ) => void,
    ) => {
        if (options.all === true) {
            callback(null, [{ address, family }]);

            return;
        }

        callback(null, address, family);
    };
}

function send(url: URL, address: string): Promise<Attempt> {
    return new Promise((resolve, reject) => {
        const secure = url.protocol === "https:";
        const family = address.includes(":") ? 6 : 4;

        const requester = secure ? httpsRequest : httpRequest;

        const clientRequest = requester(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port.length > 0 ? url.port : secure ? 443 : 80,
                path: `${url.pathname}${url.search}`,
                method: "GET",
                headers: {
                    "user-agent": PROBE_USER_AGENT,
                    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
                    "accept-encoding": "gzip, deflate, br",
                    "accept-language": "en",
                },
                lookup: pinnedLookup(address, family),
                agent: false,
                rejectUnauthorized: false,
                timeout: HTTP_TIMEOUT_MS,
            },
            (response) => resolve({ response, url }),
        );

        clientRequest.once("timeout", () => {
            clientRequest.destroy(new Error("timeout"));
        });
        clientRequest.once("error", reject);
        clientRequest.end();
    });
}

function decompress(response: IncomingMessage): Readable {
    const encoding = (response.headers["content-encoding"] ?? "").toString().toLowerCase();

    if (encoding.includes("br")) {
        return response.pipe(createBrotliDecompress());
    }

    if (encoding.includes("gzip")) {
        return response.pipe(createGunzip());
    }

    if (encoding.includes("deflate")) {
        return response.pipe(createInflate());
    }

    return response;
}

/**
 * Reads at most `MAX_HTML_BYTES` and then drops the socket. Signatures live in
 * the head and the first script tags; the rest of a page is only bandwidth this
 * server would be paying for on a stranger's behalf.
 */
function readCapped(stream: Readable, response: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];

        let total = 0;

        const finish = () => resolve(Buffer.concat(chunks).toString("utf8"));

        stream.on("data", (chunk: Buffer) => {
            total += chunk.length;
            chunks.push(chunk);

            if (total >= MAX_HTML_BYTES) {
                response.destroy();
                finish();
            }
        });

        stream.once("end", finish);
        // A truncated or corrupt body is still worth whatever arrived before it
        // broke; a decompression error is not a reason to lose the headers.
        stream.once("error", finish);
        response.once("aborted", finish);
    });
}

function cookieNamesOf(response: IncomingMessage): readonly string[] {
    const raw = response.headers["set-cookie"] ?? [];

    return raw
        .map((cookie) => cookie.split("=")[0]?.trim() ?? "")
        .filter((name) => name.length > 0);
}

export async function probeSite(
    hostname: string,
    resolver: DnsResolver,
): Promise<PanelResult<SiteProbe>> {
    const hops: HttpHop[] = [];

    let current = new URL(`https://${hostname.includes(":") ? `[${hostname}]` : hostname}/`);
    let triedPlainHttp = false;

    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
        const guarded = await resolvePublicAddresses(current.hostname, resolver);

        if (!guarded.ok) {
            return { ok: false, reason: guarded.reason };
        }

        let attempt: Attempt;

        try {
            attempt = await send(current, guarded.addresses[0]);
        } catch (caught) {
            // A site that only speaks plain HTTP is common enough to be worth
            // one retry, and only from the first hop — a redirect that fails is
            // a redirect that failed.
            if (!triedPlainHttp && current.protocol === "https:" && hops.length === 0) {
                triedPlainHttp = true;
                current = new URL(`http://${current.host}/`);
                hop -= 1;

                continue;
            }

            logEvent("warn", "domain_inspector.probe_failed", {
                hostname,
                error: describeError(caught),
            });

            return { ok: false, reason: "http_failed" };
        }

        const { response } = attempt;
        const status = response.statusCode ?? 0;
        const location = response.headers.location ?? null;

        hops.push({ url: current.toString(), status, location });

        if (status >= 300 && status < 400 && location !== null) {
            response.destroy();

            try {
                current = new URL(location, current);
            } catch {
                return { ok: false, reason: "http_failed" };
            }

            if (current.protocol !== "https:" && current.protocol !== "http:") {
                return { ok: false, reason: "http_failed" };
            }

            continue;
        }

        const headers = toHeaderMap(
            Object.entries(response.headers).map(
                ([name, value]) =>
                    [name, Array.isArray(value) ? value.join(", ") : (value ?? "")] as const,
            ),
        );

        const contentType = headers["content-type"] ?? null;
        const isMarkup = contentType === null || /html|xml|text\//i.test(contentType);
        const html = isMarkup ? await readCapped(decompress(response), response) : "";

        if (!isMarkup) {
            response.destroy();
        }

        const securityHeaders = readSecurityHeaders(headers);

        return {
            ok: true,
            data: {
                report: {
                    finalUrl: current.toString(),
                    status,
                    hops,
                    server: headers.server ?? null,
                    poweredBy: headers["x-powered-by"] ?? null,
                    contentType,
                    securityHeaders,
                    grade: gradeSecurityHeaders(securityHeaders),
                    title: readPageTitle(html),
                    declaredLicense: readDeclaredLicense(html),
                },
                headers,
                html,
                generator: readGenerator(html),
                cookieNames: cookieNamesOf(response),
            },
        };
    }

    // Out of hops: a redirect loop, or a chain longer than anyone should need.
    return { ok: false, reason: "http_failed" };
}
