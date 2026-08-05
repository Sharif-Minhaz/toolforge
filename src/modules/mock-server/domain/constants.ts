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

/** The HttpOnly cookie carrying one secret per owned workspace. */
export const WORKSPACE_COOKIE_NAME = "toolforge.mock";

/**
 * A year. The cookie *is* the visitor's only handle on their work unless they
 * saved the recovery key, so a short expiry would quietly delete it for them.
 */
export const WORKSPACE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Secrets are joined by a character the alphabet cannot contain, so parsing is
 * a `split` that cannot be confused by a value. JSON in a cookie would need
 * escaping and would fail closed on one bad byte instead of one bad entry.
 */
export const WORKSPACE_COOKIE_SEPARATOR = ".";

/** Never typed by a human — it only has to be unguessable and cookie-safe. */
export const SECRET_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 32 characters of a 36-symbol alphabet: about 165 bits. */
export const SECRET_LENGTH = 32;

/**
 * Crockford's base32. `I`, `L`, `O` and `U` are absent — the first three
 * because they are read back as `1`, `1` and `0`, and `U` so that no draw can
 * spell an unfortunate word.
 */
export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 16 characters of a 32-symbol alphabet: exactly 80 bits. */
export const RECOVERY_KEY_LENGTH = 16;

/** Printed as four groups of four — `8QXK-H72D-9FLC-4M2P`. */
export const RECOVERY_GROUP_SIZE = 4;

export const RECOVERY_GROUP_SEPARATOR = "-";

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

/**
 * The public path segment naming a server: `/m/<key>/…`. A DNS label's rules,
 * so the same key still works unchanged when execution moves to
 * `<key>.mock.<site>`.
 */
export const SERVER_KEY_LENGTH = { min: 3, max: 32 } as const;

export const SERVER_KEY_PATTERN = /^[a-z0-9-]+$/;

/**
 * Keys this service will not hand out.
 *
 * Two groups, and the second is the one that matters. The first is
 * infrastructure — anything that already names a path here, so a mock server
 * can never shadow a real route if execution ever moves back onto this origin's
 * root. The second is the phishing set: a link reading `/m/secure-login/...`
 * borrows this site's name to look like somebody's sign-in page, which is the
 * same reservation list the URL Shortener keeps and for the same reason.
 *
 * Every entry has to be something `checkServerKey` would otherwise have
 * accepted — at least `SERVER_KEY_LENGTH.min` characters, inside
 * `SERVER_KEY_PATTERN`. A shorter one is protection nobody could have reached,
 * which reads as safety while providing none, and a test enforces exactly that.
 * `m` was here until it did: the prefix is a literal path segment in front of
 * the key, so nothing could ever have collided with it anyway.
 */
export const RESERVED_SERVER_KEYS: ReadonlySet<string> = new Set([
    "api",
    "app",
    "assets",
    "cdn",
    "docs",
    "help",
    "mock",
    "mocks",
    "next",
    "public",
    "static",
    "status",
    "support",
    "tools",
    "unlock",
    "www",
    // Anything that reads as a lure.
    "account",
    "admin",
    "auth",
    "bank",
    "billing",
    "checkout",
    "confirm",
    "identity",
    "invoice",
    "login",
    "logon",
    "pay",
    "payment",
    "recover",
    "reset",
    "secure",
    "security",
    "signin",
    "signup",
    "update",
    "validate",
    "verify",
    "wallet",
]);

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
