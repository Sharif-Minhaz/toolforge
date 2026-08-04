/**
 * Every limit this tool runs under, in one place.
 *
 * They are not tuning knobs. A hosted port scanner is an abuse surface before
 * it is a feature — the scan leaves this server, so the host being scanned sees
 * this site's address and not the visitor's — and these numbers are most of
 * what keeps it from being a free anonymous scanning service.
 */

/** Characters the host box accepts, before anything is resolved. */
export const MAX_INPUT_LENGTH = 2_048;

/**
 * Ports per scan.
 *
 * The ceiling is a bandwidth decision as much as a time one: 128 half-open
 * connections is a rude thing to do to a stranger's host, and several thousand
 * is a denial of service with a progress bar. Nmap's own "top ports" list is
 * 23 entries; the presets here are all well inside this.
 */
export const MAX_PORTS_PER_SCAN = 128;

/**
 * How long one port may take before it is called `filtered`.
 *
 * Too short and a slow but reachable host reads as firewalled; too long and a
 * fully-dropped scan sits at the ceiling. A second and a half is comfortably
 * past intercontinental round trips, which top out near 400 ms.
 */
export const PORT_TIMEOUT_MS = 1_500;

/**
 * Sockets open at once.
 *
 * Sequential would take three minutes for a full batch, and unbounded would
 * open 128 at once — which looks exactly like a SYN flood from the far end and
 * is the behaviour that gets a server's address blocked. Sixteen finishes the
 * largest allowed scan in about twelve seconds.
 */
export const SCAN_CONCURRENCY = 16;

/**
 * The whole scan's deadline, whatever is still outstanding.
 *
 * Serverless functions are killed at their own limit with no result at all, so
 * this fires first and returns what it has. Anything unfinished is reported as
 * `filtered`, which is what an unanswered probe means anyway.
 */
export const SCAN_DEADLINE_MS = 20_000;

/** Scans per visitor per window. */
export const QUOTA_LIMIT = 10;

export const QUOTA_WINDOW_MS = 60 * 60 * 1_000;

/** Names this tool's checkbox in the Turnstile dashboard. */
export const TURNSTILE_ACTION = "port-scan";
