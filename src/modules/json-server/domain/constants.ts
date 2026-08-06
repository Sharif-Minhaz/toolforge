/**
 * Every limit the JSON Server Studio runs on, named once.
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

export const SERVER_NAME_LENGTH = { min: 1, max: 60 } as const;

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

// ─── Document size: two numbers, and the gap between them is the feature ────

/**
 * The largest document that may be *uploaded* — pasted, imported, or written
 * back from the studio's own editor.
 *
 * Below `MAX_DOCUMENT_BYTES` on purpose. A server created at exactly its own
 * ceiling would be full before its first `POST`, so the first thing a new
 * visitor met would be a refusal. The gap is the room to actually use the thing.
 */
export const MAX_UPLOAD_BYTES = 900 * 1_024;

/**
 * The hard ceiling on the stored document.
 *
 * Reaching it locks `POST`, `PUT` and `PATCH` — and **only** those. `GET`,
 * `DELETE` and `OPTIONS` keep working, which is what makes the lock recoverable:
 * a full server can still be read, and deleting a record is the way out. A
 * ceiling that also blocked `DELETE` would be a trap rather than a limit, and
 * the only escape would be resetting the whole document.
 *
 * The gate reads `sizeBytes` from the row rather than measuring, so it costs a
 * column rather than a serialisation of everything it is guarding.
 */
export const MAX_DOCUMENT_BYTES = 1_024 * 1_024;

/**
 * The point at which the studio starts saying so, as a fraction of the ceiling.
 *
 * A limit somebody meets without warning reads as a fault. At 80% the usage bar
 * changes tone and the copy names the number, so the lock is something a visitor
 * saw coming rather than something that happened to them.
 */
export const DOCUMENT_WARN_RATIO = 0.8;

// ─── Document shape ─────────────────────────────────────────────────────────

/** Top-level keys. Each is a collection or a singular resource. */
export const MAX_COLLECTIONS = 50;

/**
 * Records in one collection.
 *
 * The byte ceiling bounds this already for any realistic record, but a
 * collection of a hundred thousand `1`s would fit and would make every write a
 * hundred-thousand-element rewrite. This is the bound on *work*, not on size.
 */
export const MAX_ITEMS_PER_COLLECTION = 10_000;

/** Matches `MAX_JSON_DEPTH`'s job: a bound the reader can report rather than crash on. */
export const MAX_DOCUMENT_DEPTH = 24;

/**
 * A resource name has to survive being a path segment and being read aloud.
 *
 * Deliberately narrower than JSON allows a key to be: `posts` and `blog_posts`
 * are resources, `a/b` and `?x` are not, and a key that needed escaping to
 * appear in a URL would make its own routes unusable. Keys outside this are not
 * an error — they are simply not published as routes, and the studio says so.
 */
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const MAX_RESOURCE_NAME_LENGTH = 64;

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
