import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { SITE_NAME, SITE_URL } from "@/modules/seo/domain/site";
import { checkPublicUrl } from "@/modules/tools/domain/public-url";
import { isIpAddress } from "@/modules/tools/domain/ip";
import { guardAddresses } from "@/modules/tools/repository/address-guard";

import { CHARSET_SNIFF_BYTES, DEFAULT_CHARSET, sniffCharset } from "../domain/charset";
import {
    MAX_PAGE_BYTES,
    MAX_PAGE_REDIRECTS,
    PAGE_CONNECT_TIMEOUT_MS,
    PAGE_TOTAL_TIMEOUT_MS,
} from "../domain/constants";
import type { FetchHop, PageFacts, PageFetchFailure } from "../types";

/**
 * Fetches one page the way a link-preview crawler does: a GET, redirects
 * followed, the head read, the rest left on the wire.
 *
 * Built to the same rules as the shared image fetcher in
 * `tools/repository/remote-image.ts`, and kept beside it rather than merged
 * with it. The two differ in what they accept, how they stop reading, and what
 * they hand back, and a shared version would need all three injected — decision
 * 39's fourth branch, where the duplication costs less than the abstraction.
 *
 * - **Resolve first, then connect to the address that was checked**, through
 *   `lookup`, because `fetch` cannot be told which address to use and a name
 *   with a one-second TTL can answer publicly for the check and privately for
 *   the connection.
 * - **Every redirect is a new host and a new decision**: re-parsed, re-resolved
 *   and re-guarded, and the chain is capped.
 * - **The body is capped while it streams**, after decompression, so a small
 *   gzip that inflates to a gigabyte is cut at the same megabyte as anything
 *   else. Reading stops the moment `</head>` arrives.
 * - **Nothing is forwarded.** No cookie, no authorization, no referrer; the
 *   far end sees this server's address and a user agent naming this tool.
 */

export const LINK_PREVIEW_USER_AGENT = `${SITE_NAME}-LinkPreview/1.0 (+${SITE_URL})`;

export type FetchedPage =
    | {
          readonly ok: true;
          readonly facts: PageFacts;
          /** Decoded markup, up to and including `</head>` when it arrived. */
          readonly html: string;
      }
    | { readonly ok: false; readonly reason: PageFetchFailure };

type Resolved = { readonly address: string; readonly family: 4 | 6 };

type Resolution =
    | { readonly ok: true; readonly resolved: Resolved }
    | { readonly ok: false; readonly reason: "blocked_address" | "unresolved_host" };

/**
 * The address to connect to, or why there is none.
 *
 * Two refusals, kept apart: a name that resolves only to private space is
 * `blocked_address`, and a name that does not resolve at all is
 * `unresolved_host`. Reporting a DNS timeout as "blocked" would tell a reader
 * their public site is on a deny list.
 */
async function resolveGuarded(rawHostname: string): Promise<Resolution> {
    // `URL.hostname` keeps the brackets on an IPv6 literal, and `lookup` does
    // not accept them — so a literal is guarded directly instead of resolved.
    const hostname = rawHostname.replace(/^\[|\]$/g, "");

    if (isIpAddress(hostname)) {
        const guard = guardAddresses([hostname], "link_preview");

        return guard.ok
            ? { ok: true, resolved: { address: hostname, family: hostname.includes(":") ? 6 : 4 } }
            : { ok: false, reason: "blocked_address" };
    }

    let answers: { address: string; family: number }[];

    try {
        answers = await lookup(hostname, { all: true, verbatim: true });
    } catch (caught) {
        logEvent("warn", "link_preview.resolve_failed", { error: describeError(caught) });

        return { ok: false, reason: "unresolved_host" };
    }

    const guard = guardAddresses(
        answers.map((answer) => answer.address),
        "link_preview",
    );

    if (!guard.ok) {
        return {
            ok: false,
            reason: guard.reason === "no_address" ? "unresolved_host" : "blocked_address",
        };
    }

    const chosen = answers.find((answer) => guard.addresses.includes(answer.address));

    return chosen === undefined
        ? { ok: false, reason: "blocked_address" }
        : { ok: true, resolved: { address: chosen.address, family: chosen.family === 6 ? 6 : 4 } };
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

type Body = {
    readonly bytes: Buffer;
    readonly headEndsAt: number | null;
    readonly truncated: boolean;
};

/**
 * Reads until `</head>`, the byte ceiling, or the end — whichever is first.
 *
 * The search runs over a Latin-1 view of the bytes, which maps every byte to
 * one character, so a match index is a byte offset whatever the page's real
 * character set, and the ASCII of `</head>` reads the same in all of them.
 */
function readHead(stream: Readable, response: IncomingMessage): Promise<Body> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let scanned = "";
        let settled = false;

        function finish(headEndsAt: number | null, truncated: boolean) {
            if (settled) {
                return;
            }

            settled = true;
            response.destroy();
            resolve({ bytes: Buffer.concat(chunks), headEndsAt, truncated });
        }

        stream.on("data", (chunk: Buffer) => {
            const room = MAX_PAGE_BYTES - total;
            const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;

            chunks.push(kept);
            total += kept.length;

            // Only the new bytes, plus enough of the old to catch a tag split
            // across two chunks.
            const overlap = Math.max(0, scanned.length - 8);
            scanned = scanned.slice(overlap) + kept.toString("latin1");
            const found = scanned.search(/<\/head\s*>/i);

            if (found >= 0) {
                finish(total - (scanned.length - found), false);

                return;
            }

            if (total >= MAX_PAGE_BYTES) {
                finish(null, true);
            }
        });

        stream.once("end", () => finish(null, false));
        // A truncated or corrupt body is still worth whatever arrived before
        // it broke; a decompression error is not a reason to lose the head.
        stream.on("error", () => finish(null, false));
        response.once("aborted", () => finish(null, false));
    });
}

function decode(bytes: Buffer, charset: string): { text: string; charset: string } {
    try {
        return { text: new TextDecoder(charset).decode(bytes), charset };
    } catch {
        // An unknown label is the page's mistake, not a reason to show nothing.
        return { text: new TextDecoder(DEFAULT_CHARSET).decode(bytes), charset: DEFAULT_CHARSET };
    }
}

type HopOutcome =
    | { readonly kind: "redirect"; readonly status: number; readonly location: string }
    | { readonly kind: "page"; readonly status: number; readonly response: IncomingMessage }
    | { readonly kind: "failed"; readonly reason: PageFetchFailure };

function sendOnce(url: URL, resolved: Resolved): Promise<HopOutcome> {
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
                // The address, never the hostname — re-resolving here would
                // hand the decision back to whoever controls the record.
                host: resolved.address,
                family: resolved.family,
                port: url.port === "" ? undefined : Number(url.port),
                path: `${url.pathname}${url.search}`,
                method: "GET",
                headers: {
                    host: url.host,
                    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
                    "accept-encoding": "gzip, deflate, br",
                    "accept-language": "en",
                    "user-agent": LINK_PREVIEW_USER_AGENT,
                },
                // SNI carries a name, never an address (RFC 6066), so a literal
                // sends none.
                servername:
                    url.protocol === "https:" && !isIpAddress(url.hostname.replace(/^\[|\]$/g, ""))
                        ? url.hostname
                        : undefined,
                timeout: PAGE_CONNECT_TIMEOUT_MS,
                lookup: (_hostname, _options, callback) => {
                    callback(null, resolved.address, resolved.family);
                },
            },
            (response) => {
                const status = response.statusCode ?? 0;
                const location = response.headers.location;

                if (status >= 300 && status < 400 && location !== undefined) {
                    response.destroy();
                    finish({ kind: "redirect", status, location });

                    return;
                }

                finish({ kind: "page", status, response });
            },
        );

        const deadline = setTimeout(() => {
            request.destroy();
            finish({ kind: "failed", reason: "timed_out" });
        }, PAGE_TOTAL_TIMEOUT_MS);

        request.on("timeout", () => {
            request.destroy();
            finish({ kind: "failed", reason: "timed_out" });
        });

        request.on("error", (caught) => {
            logEvent("warn", "link_preview.request_failed", { error: describeError(caught) });
            finish({ kind: "failed", reason: "upstream_failed" });
        });

        request.on("close", () => clearTimeout(deadline));

        request.end();
    });
}

function isMarkup(contentType: string | null): boolean {
    return contentType === null || /html|xml/i.test(contentType);
}

export async function fetchPreviewPage(rawUrl: string): Promise<FetchedPage> {
    const hops: FetchHop[] = [];
    let target = rawUrl;

    for (let hop = 0; hop <= MAX_PAGE_REDIRECTS; hop += 1) {
        const checked = checkPublicUrl(target);

        if (!checked.ok) {
            return { ok: false, reason: hop === 0 ? checked.reason : "upstream_failed" };
        }

        const resolution = await resolveGuarded(checked.url.hostname);

        if (!resolution.ok) {
            return { ok: false, reason: resolution.reason };
        }

        const outcome = await sendOnce(checked.url, resolution.resolved);

        if (outcome.kind === "failed") {
            return { ok: false, reason: outcome.reason };
        }

        hops.push({ url: checked.url.toString(), status: outcome.status });

        if (outcome.kind === "redirect") {
            try {
                // Resolved against the current URL so a relative `Location`
                // works, then run through the whole check again from the top.
                target = new URL(outcome.location, checked.url).toString();
            } catch {
                return { ok: false, reason: "upstream_failed" };
            }

            continue;
        }

        const { response, status } = outcome;
        const header = response.headers["content-type"];
        const contentType = header === undefined ? null : header.toString();

        const facts = (charset: string, body: Body | null): PageFacts => ({
            requestedUrl: rawUrl,
            finalUrl: checked.url.toString(),
            status,
            hops,
            contentType,
            charset,
            headEndsAt: body?.headEndsAt ?? null,
            truncated: body?.truncated ?? false,
        });

        if (!isMarkup(contentType)) {
            // A PDF or a picture has no head, and its bytes are not ours to spend.
            response.destroy();

            return { ok: true, facts: facts(DEFAULT_CHARSET, null), html: "" };
        }

        const body = await readHead(decompress(response), response);

        if (body.bytes.length === 0 && status >= 200 && status < 300) {
            return { ok: false, reason: "empty_response" };
        }

        const charset = sniffCharset(contentType, body.bytes.subarray(0, CHARSET_SNIFF_BYTES));
        const decoded = decode(body.bytes, charset);

        return { ok: true, facts: facts(decoded.charset, body), html: decoded.text };
    }

    return { ok: false, reason: "too_many_redirects" };
}
