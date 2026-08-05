import type { JsonValue } from "../types/graph";

/**
 * The rules an outbound request from inside a mock has to satisfy.
 *
 * This node is the reason the milestone ladder put it last. A graph that can
 * open a connection to an address a stranger typed makes this server two things
 * it must never be: a server-side request forgery proxy — a mock fetching
 * `http://169.254.169.254/` reads the cloud metadata credentials and returns
 * them in a response body — and an amplifier, since one request to a mock
 * becomes one request to a third party carrying *this* server's address and
 * reputation.
 *
 * Everything here is the pure half: what a URL must look like, how many hops a
 * redirect may take, how much may come back. The half that resolves a name and
 * refuses a private address is `tools/repository/address-guard.ts`, which was
 * written for exactly this and is load-bearing rather than precautionary here.
 */

/** Only these two. No `file:`, no `gopher:`, no `data:`. */
export const ALLOWED_OUTBOUND_SCHEMES = ["http:", "https:"] as const;

/** Per execution. A graph cannot become a fan-out engine. */
export const MAX_OUTBOUND_CALLS = 3;

export const OUTBOUND_CONNECT_TIMEOUT_MS = 5_000;

export const OUTBOUND_TOTAL_TIMEOUT_MS = 8_000;

/** What comes back is read into memory, so it is capped hard. */
export const MAX_OUTBOUND_RESPONSE_BYTES = 256 * 1_024;

/**
 * Redirects are followed by hand, one at a time, each re-guarded.
 *
 * Following them automatically hands the destination decision to whoever wrote
 * the `Location` header — a public URL that 302s to `169.254.169.254` defeats
 * a check done only on the first address. Three is enough for the
 * `http → https → canonical host` chain real APIs use.
 */
export const MAX_OUTBOUND_REDIRECTS = 3;

/** Per address, per window. The limit that bounds volume rather than one call. */
export const OUTBOUND_QUOTA_LIMIT = 60;

export const OUTBOUND_QUOTA_WINDOW_MS = 60 * 60 * 1_000;

export const OUTBOUND_PROBLEMS = [
    "invalid_url",
    "scheme_not_allowed",
    "blocked_address",
    "too_many_calls",
    "too_many_redirects",
    "response_too_large",
    "timed_out",
    "quota_exhausted",
    "not_configured",
    "upstream_failed",
] as const;

export type OutboundProblem = (typeof OUTBOUND_PROBLEMS)[number];

export type UrlCheck =
    | { readonly ok: true; readonly url: URL }
    | { readonly ok: false; readonly reason: OutboundProblem };

/**
 * Whether a string could be a destination at all.
 *
 * Shape only, and shape is not safety: a perfectly well-formed
 * `http://metadata.attacker.example/` passes this and is exactly the attack the
 * address guard exists to stop. This runs first because it is free, and the
 * guard runs after because it needs a DNS answer.
 */
export function checkOutboundUrl(raw: string): UrlCheck {
    let url: URL;

    try {
        url = new URL(raw.trim());
    } catch {
        return { ok: false, reason: "invalid_url" };
    }

    if (!(ALLOWED_OUTBOUND_SCHEMES as readonly string[]).includes(url.protocol)) {
        return { ok: false, reason: "scheme_not_allowed" };
    }

    // Credentials in a URL would be sent to whatever the guard resolves, and
    // they are never something a mock's author needs to express this way.
    if (url.username !== "" || url.password !== "") {
        return { ok: false, reason: "invalid_url" };
    }

    return { ok: true, url };
}

export type OutboundHeaders = Readonly<Record<string, string>>;

/**
 * Headers this service will not forward, whatever a graph asks for.
 *
 * The first three would let a mock impersonate a caller to the third party.
 * `host` would let it target one server while claiming to address another,
 * which is how a request gets past a reverse proxy's routing.
 */
const FORBIDDEN_OUTBOUND_HEADERS: ReadonlySet<string> = new Set([
    "cookie",
    "authorization",
    "proxy-authorization",
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
]);

export function sanitizeOutboundHeaders(headers: OutboundHeaders): Record<string, string> {
    const out: Record<string, string> = {};

    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase();

        if (FORBIDDEN_OUTBOUND_HEADERS.has(lower)) {
            continue;
        }

        // A header value carrying a newline is a request-splitting attempt.
        if (/[\r\n]/u.test(value)) {
            continue;
        }

        out[lower] = value;
    }

    return out;
}

export type OutboundResult = {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: JsonValue;
    /** True when the response was cut at the size ceiling. */
    readonly truncated: boolean;
};

/**
 * What a graph sees after an outbound call.
 *
 * Deliberately narrow. The upstream's own headers are *not* passed through
 * wholesale — only a handful worth reading — because a mock returning a third
 * party's `set-cookie` into its own response would be laundering somebody
 * else's session through this origin.
 */
export const FORWARDED_RESPONSE_HEADERS: readonly string[] = [
    "content-type",
    "content-length",
    "etag",
    "last-modified",
];

export function pickResponseHeaders(
    headers: Readonly<Record<string, string>>,
): Record<string, string> {
    const out: Record<string, string> = {};

    for (const [name, value] of Object.entries(headers)) {
        if (FORWARDED_RESPONSE_HEADERS.includes(name.toLowerCase())) {
            out[name.toLowerCase()] = value;
        }
    }

    return out;
}
