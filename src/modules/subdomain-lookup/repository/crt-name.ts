import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { CRT_NAME_ENDPOINT, LOOKUP_TIMEOUT_MS, MAX_RESPONSE_BYTES } from "../domain/constants";
import type { LookupFailureReason } from "../types";

/**
 * The one call this tool makes, and everything that can come back from it.
 *
 * **This is not the SSRF problem the other network tools have.** The
 * destination is a constant two lines below, not a host the reader named, so
 * there is no address to resolve first and no redirect hop to re-guard — the
 * doctrine in `docs/patterns/outbound-requests.md` part one does not apply. What
 * the reader controls is one query parameter, which is why `apex.ts` reduces it
 * to an eTLD+1 before it ever reaches here and why it is encoded rather than
 * concatenated.
 *
 * The problem it *does* have is size, and it is met twice. Here, in bytes,
 * while the body streams: reading a reply in full and measuring it afterwards is
 * how something nobody predicted takes the process down. Then again in
 * `parse.ts`, in records, because a body small enough to hold is still not
 * necessarily a list small enough to send to a browser.
 *
 * Redirects are `manual` on purpose. Not for safety — nothing here follows one
 * anyway — but because a redirect from this endpoint would mean the API moved,
 * and quietly following it to some other host is not a thing to do with a
 * reader's query. It surfaces as `upstream_unavailable`, which is what it is.
 */

export type IndexFetchResult =
    | { readonly ok: true; readonly body: string }
    | { readonly ok: false; readonly reason: UpstreamFailureReason };

export type UpstreamFailureReason = Extract<
    LookupFailureReason,
    | "apex_too_large"
    | "upstream_refused"
    | "upstream_exhausted"
    | "upstream_unavailable"
    | "response_too_large"
>;

/**
 * Says who is calling and where to complain.
 *
 * The index is free, unauthenticated and run by one person. A caller that
 * cannot be identified is a caller that can only be blocked by address, and
 * this deployment shares one address with every one of its visitors.
 */
const LOOKUP_USER_AGENT =
    "ToolForge-SubdomainLookup/1.0 (+https://github.com/Sharif-Minhaz/toolforge)";

/**
 * How little of the upstream's daily allowance may be left before it is worth
 * saying so in the log. A tenth of the thousand a day the index grants, which is
 * roughly the point at which the site is a couple of busy hours from refusing.
 */
const UPSTREAM_BUDGET_WARN_AT = 100;

function buildUrl(apex: string): string {
    const url = new URL(CRT_NAME_ENDPOINT);

    url.searchParams.set("apex", apex);
    // Tab-separated `name<TAB>instant`, which is the compact form of the same
    // answer the endpoint will otherwise send as JSON. See `parse.ts`.
    url.searchParams.set("dates", "1");

    return url.toString();
}

/**
 * Reads the body, refusing rather than buffering once it passes the ceiling.
 *
 * The reader is cancelled at the cut, so the remainder is never pulled over the
 * wire — a cap that still downloads the whole reply before rejecting it saves
 * the memory and none of the bandwidth.
 */
async function readCappedBody(response: Response): Promise<string | null> {
    const body = response.body;

    if (body === null) {
        return "";
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            bytes += value.byteLength;

            if (bytes > MAX_RESPONSE_BYTES) {
                return null;
            }

            // `stream: true`, so a multi-byte character split across two chunks
            // is held rather than turned into a replacement character.
            chunks.push(decoder.decode(value, { stream: true }));
        }

        chunks.push(decoder.decode());

        return chunks.join("");
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

export async function fetchSubdomainIndex(apex: string): Promise<IndexFetchResult> {
    let response: Response;

    try {
        response = await fetch(buildUrl(apex), {
            headers: { accept: "text/plain", "user-agent": LOOKUP_USER_AGENT },
            redirect: "manual",
            // Never cached by the framework: the index changes continuously, and
            // a cached answer would make "first seen" mean "first seen before we
            // last asked".
            cache: "no-store",
            signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        });
    } catch (caught) {
        logEvent("warn", "subdomain_lookup.upstream_unreachable", {
            error: describeError(caught),
        });

        return { ok: false, reason: "upstream_unavailable" };
    }

    // Logged rather than shown, and only when it is low. This is the
    // *deployment's* remaining share of the upstream's daily allowance, not this
    // visitor's — putting a number in the UI that every visitor drains together
    // would read as a personal budget — but somebody running this site needs to
    // hear about it before the tool starts refusing everybody.
    const remaining = Number(response.headers.get("x-ratelimit-remaining"));

    if (Number.isFinite(remaining) && remaining <= UPSTREAM_BUDGET_WARN_AT) {
        logEvent("warn", "subdomain_lookup.upstream_budget_low", { remaining });
    }

    if (response.status === 413) {
        return { ok: false, reason: "apex_too_large" };
    }

    if (response.status === 429) {
        return { ok: false, reason: "upstream_exhausted" };
    }

    if (response.status === 400) {
        return { ok: false, reason: "upstream_refused" };
    }

    if (!response.ok) {
        logEvent("warn", "subdomain_lookup.upstream_status", { status: response.status });

        return { ok: false, reason: "upstream_unavailable" };
    }

    try {
        const body = await readCappedBody(response);

        return body === null ? { ok: false, reason: "response_too_large" } : { ok: true, body };
    } catch (caught) {
        logEvent("warn", "subdomain_lookup.body_read_failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
