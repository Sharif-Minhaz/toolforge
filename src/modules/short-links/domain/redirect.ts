import type { RedirectDecision, RedirectRecord } from "../types";
import { scheduleState } from "./schedule";
import { parseTargetUrl } from "./target";

/**
 * What a visit to a short link should do, as one pure function.
 *
 * Kept out of the route handlers so both `/q` and `/s` reach the same verdict,
 * and so every branch — an expired window, a password gate, a row whose stored
 * target went bad — is reachable from a test without a database.
 */
export function decideRedirect(record: RedirectRecord | null, nowMs: number): RedirectDecision {
    if (record === null) {
        return { kind: "missing" };
    }

    // The window is checked before the password, so an expired link says it
    // expired instead of inviting a stranger to guess at a password that would
    // not have worked anyway.
    const state = scheduleState(record.startsAt, record.expiresAt, nowMs);

    if (state !== "active") {
        return { kind: state };
    }

    if (record.passwordHash !== null) {
        return { kind: "password" };
    }

    // Re-checked on the way out as well as on the way in. The stored value was
    // validated when the link was created, but this is the line that becomes a
    // `Location` header, and a header is not the place to assume anything.
    const parsed = parseTargetUrl(record.target);

    return parsed.ok ? { kind: "redirect", target: parsed.url } : { kind: "missing" };
}

/**
 * The headers every short-link hop carries, whichever prefix it came in on.
 *
 * Each one is load-bearing:
 *
 * - `Cache-Control: no-store` — a short link is a pointer, not content. Caching
 *   it anywhere would outlive the next time its owner re-points it, and would
 *   defeat an expiry window outright.
 * - `X-Robots-Tag` — the destination belongs to whoever created the link, so
 *   this origin lends it none of its own search ranking.
 * - `Referrer-Policy` — the destination has no business learning which slug
 *   sent the visitor, or that this service exists at all.
 */
export const REDIRECT_HEADERS: Readonly<Record<string, string>> = {
    "Cache-Control": "no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
};

/**
 * `302` for a live link, never `301`: the whole point of a re-pointable link is
 * that its destination changes, and a permanent redirect is cached indefinitely
 * by every browser that has already followed it once. `307` for everything
 * else, which is this site talking to its own pages.
 */
export function redirectResponse(location: string, status: 302 | 307): Response {
    return new Response(null, {
        status,
        headers: { ...REDIRECT_HEADERS, Location: location },
    });
}
