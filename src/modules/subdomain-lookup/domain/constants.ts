/**
 * Every bound this tool runs under, in one place.
 *
 * Two of them are unusual enough to be worth reading before changing:
 *
 * **The upstream index is free and unauthenticated, and it meters by address.**
 * crt.name allows a thousand calls per IP per day. The address it sees is this
 * deployment's, not the reader's, so that thousand is the *whole site's* daily
 * allowance and not each visitor's. That is the same trap the Watermark
 * Remover's worker set — see `docs/patterns/outbound-requests.md` — and it is
 * why the deployment-wide counter below exists alongside the per-visitor one.
 *
 * **An apex can hold more names than anything here should hold in memory.** The
 * upstream refuses the very largest itself with a 413, but "small enough for
 * crt.name to serve" is still large enough to be worth capping twice: once in
 * bytes while the body streams, and once in records after it is parsed.
 */

/** Where the index lives. Fixed, so nothing a reader types chooses a host. */
export const CRT_NAME_ENDPOINT = "https://crt.name/v1/search";

/** The page a reader is sent to for the index's own terms and limits. */
export const CRT_NAME_HOME = "https://crt.name/";

/**
 * Characters the apex box accepts.
 *
 * Eight times the longest legal hostname, because the field also takes a pasted
 * URL and trims it down. The cut can only ever land in something that was never
 * a domain.
 */
export const MAX_INPUT_LENGTH = 2_048;

/** How long the whole upstream call may take before it is abandoned. */
export const LOOKUP_TIMEOUT_MS = 20_000;

/**
 * The hard ceiling on the response body, enforced **while it streams**.
 *
 * Reading it all and measuring afterwards is how a reply nobody predicted kills
 * the process. Four megabytes of tab-separated `name<TAB>timestamp` lines is
 * roughly ninety thousand records — far past anything a person reads and far
 * past what the record cap below keeps anyway.
 */
export const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;

/**
 * Records kept after parsing.
 *
 * The second cap, and the one that actually bounds what crosses the Server
 * Action boundary and lands in React state. Twenty thousand names is about
 * 900 KB of payload — heavy but survivable — and past it the answer to "what
 * subdomains does this apex have" has stopped being a list and become a
 * dataset. When it bites, the report says so rather than quietly showing a
 * prefix of the truth.
 */
export const MAX_RECORDS = 20_000;

/** Rows rendered at once. The rest are a page away, never dropped. */
export const PAGE_SIZE = 100;

/** How recent a first-seen date has to be to count toward "added recently". */
export const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Lookups per visitor per window.
 *
 * Generous for a person — nobody types twenty apexes an hour by hand — and
 * still far below the deployment ceiling, so one caller cannot take the tool
 * away from everybody else.
 */
export const QUOTA_LIMIT_PER_ADDRESS = 20;

/**
 * Lookups for the whole deployment per window.
 *
 * This is the number that keeps the site inside the upstream's free tier, and
 * the arithmetic is the reason for the value: 40 an hour is 960 a day against
 * an allowance of 1,000. The usual fixed-window caveat — a caller can spend the
 * tail of one window and the head of the next — moves the short-term peak but
 * not the daily total, which is what the upstream actually counts.
 */
export const QUOTA_LIMIT_PER_DEPLOYMENT = 40;

export const QUOTA_WINDOW_MS = 60 * 60 * 1_000;

/**
 * Names an MCP call returns by default.
 *
 * The same problem the page solves with paging, in the shape a program has: a
 * caller with a twenty-thousand-name list in its context window has lost the
 * conversation, not gained an answer. So the adapter takes a filter and a
 * ceiling, returns the counts alongside the names, and says when what it handed
 * back is a prefix — which is what lets a caller narrow rather than guess.
 */
export const MCP_DEFAULT_LIMIT = 200;

export const MCP_MAX_LIMIT = 2_000;
