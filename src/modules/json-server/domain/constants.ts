/**
 * Every limit the JSON Server Studio runs on that is its own, named once.
 *
 * The document's ceilings — upload size, stored size, collection and depth
 * bounds, what a resource name may be — live in
 * `tools/domain/document-limits.ts`, shared with the GraphQL Server Studio so a
 * `db.json` one accepts is never one the other refuses. What is here is the
 * REST studio's own: its path prefix, its cookie, its query-language bounds and
 * its log retention.
 */

/**
 * How many servers one browser holds at a time.
 *
 * This is an affordance, not a limit: the cookie belongs to the visitor and
 * clearing it buys five more. The limit that actually holds is the creation
 * quota, keyed on a salted digest of the caller's address — see `quota.ts`.
 */
export const MAX_SERVERS_PER_BROWSER = 5;

/** The HttpOnly cookie carrying one secret per owned server. */
export const SERVER_COOKIE_NAME = "toolforge.jsonserver";

/**
 * Creations allowed per address per window.
 *
 * Higher than the five a browser can hold, because an office behind one address
 * is a normal case and a visitor who deletes and recreates is not an abuser.
 * Low enough that scripting the endpoint is not worth anyone's time.
 */
export const CREATE_QUOTA_LIMIT = 10;

export const CREATE_QUOTA_WINDOW_MS = 60 * 60 * 1_000;

/** Names the challenge in Cloudflare's dashboard, as every other tool does. */
export const TURNSTILE_ACTION = "json-server";

/** The path prefix a JSON server answers on while the studio is path-hosted. */
export const JSON_EXECUTION_PREFIX = "/j";

// ─── Query semantics, matching json-server v1 ───────────────────────────────

/** `_per_page` when a `_page` was asked for and no size was given. */
export const DEFAULT_PER_PAGE = 10;

/** Above this, one request could serialise the whole document many times over. */
export const MAX_PER_PAGE = 1_000;

/** Longest `_where` expression read. Past it the query is refused, not truncated. */
export const MAX_WHERE_LENGTH = 4_096;

/**
 * How deep `_where` may nest its `and`/`or` groups. The evaluator recurses, so
 * without this a hand-written query is a stack overflow rather than a 400.
 */
export const MAX_WHERE_DEPTH = 12;

// ─── Logging ────────────────────────────────────────────────────────────────

/** Rows kept per server. Older ones are trimmed after a write. */
export const MAX_LOG_ROWS = 50;

/** A path plus its query, past which the log row keeps the front of it. */
export const MAX_LOGGED_PATH_LENGTH = 512;
