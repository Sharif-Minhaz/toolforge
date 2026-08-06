/**
 * Every limit and alphabet the studio's identity layer runs on, named once.
 */

/**
 * How many workspaces one browser holds at a time.
 *
 * This is an affordance, not a limit: the cookie belongs to the visitor and
 * clearing it buys three more. The limit that actually holds is `MockQuota`,
 * keyed on a salted digest of the caller's address — see `quota.ts`.
 */
export const MAX_WORKSPACES_PER_BROWSER = 3;

/**
 * The HttpOnly cookie carrying one secret per owned workspace.
 *
 * The alphabet, the length and the digest are shared with every other thing a
 * browser owns without an account — see `tools/domain/browser-secret.ts` — and
 * the parsing is `tools/domain/secret-cookie.ts`. What stays here is the name of
 * the cookie and how many entries it may hold, because those are the two things
 * the JSON Server Studio has different answers for.
 */
export const WORKSPACE_COOKIE_NAME = "toolforge.mock";

export const WORKSPACE_NAME_LENGTH = { min: 1, max: 60 } as const;

/**
 * Creations allowed per address per window.
 *
 * Higher than the three a browser can hold, because an office behind one
 * address is a normal case and a visitor who deletes and recreates is not an
 * abuser. Low enough that scripting the endpoint is not worth anyone's time.
 */
export const CREATE_QUOTA_LIMIT = 8;

export const CREATE_QUOTA_WINDOW_MS = 60 * 60 * 1_000;

/** Names the challenge in Cloudflare's dashboard, as every other tool does. */
export const TURNSTILE_ACTION = "mock-workspace";

// ─── Servers, collections and routes ────────────────────────────────────────

export const MAX_SERVERS_PER_WORKSPACE = 10;

export const MAX_ENDPOINTS_PER_SERVER = 200;

export const MAX_COLLECTIONS_PER_SERVER = 60;

/** Deep enough for any OpenAPI tag hierarchy, shallow enough to render. */
export const MAX_COLLECTION_DEPTH = 6;

export const SERVER_NAME_LENGTH = { min: 1, max: 60 } as const;

export const COLLECTION_NAME_LENGTH = { min: 1, max: 60 } as const;

export const ENDPOINT_NAME_LENGTH = { min: 1, max: 80 } as const;

/** The path prefix a mock endpoint answers on while the studio is path-hosted. */
export const MOCK_EXECUTION_PREFIX = "/m";

export const MAX_PATH_LENGTH = 512;

/**
 * Twelve, and the number is load-bearing: `specificity` is a base-3 number of
 * this many digits, so `3 ** MAX_PATH_SEGMENTS` must stay inside a signed 32-bit
 * integer for Postgres to hold it. 3^12 is 531,441; 3^20 is not.
 */
export const MAX_PATH_SEGMENTS = 12;

export const MAX_PARAM_NAME_LENGTH = 40;

// ─── Execution budgets ──────────────────────────────────────────────────────

/** Backstop behind save-time cycle detection, not a substitute for it. */
export const MAX_EXECUTION_STEPS = 200;

/** Whatever is unfinished at this point reports an error rather than hanging. */
export const MAX_EXECUTION_MS = 10_000;

/** An uncapped delay is a cheap way to exhaust a deployment's concurrency. */
export const MAX_DELAY_MS = 5_000;

export const MAX_RESPONSE_BYTES = 1_024 * 1_024;

export const MAX_VALUE_DEPTH = 12;

/** Per `array` expression. One number must not become unbounded work. */
export const MAX_ARRAY_ITEMS = 1_000;

/**
 * A template is the one value shape that can grow without the array ceiling
 * catching it — a template over an array expression concatenates rather than
 * counting — so it carries its own.
 */
export const MAX_TEMPLATE_LENGTH = 64 * 1_024;

export const MIN_STATUS_CODE = 100;

export const MAX_STATUS_CODE = 599;
