import type { RegexDelimiter, RegexFlag, RegexMode } from "../types";

export const DEFAULT_REGEX_MODE: RegexMode = "match";

export const DEFAULT_REGEX_DELIMITER: RegexDelimiter = "slash";

/** What regex101 opens on, and what most people expect a tester to do. */
export const DEFAULT_REGEX_FLAGS: readonly RegexFlag[] = ["global", "multiline"];

/**
 * A pattern longer than this is almost always generated rather than written,
 * and the explanation panel stops being readable well before it.
 */
export const MAX_PATTERN_LENGTH = 1_000;

/**
 * The test string ceiling. Backtracking cost grows with input length, so this
 * is a safety limit as much as a rendering one — the highlight overlay paints
 * a span per match on top of it.
 */
export const MAX_TEST_STRING_LENGTH = 50_000;

export const MAX_REPLACEMENT_LENGTH = 1_000;

/** Matches beyond this are dropped, and the UI says so rather than hiding it. */
export const MAX_MATCHES = 1_000;

/**
 * Checked between matches, so a global pattern grinding through a long input
 * gives up instead of running forever. It cannot interrupt a single
 * catastrophic match — the worker's own kill timer is what covers that.
 */
export const MATCH_TIME_BUDGET_MS = 750;

/** How often the budget is consulted; `performance.now()` is not free. */
export const TIME_CHECK_INTERVAL = 64;

/**
 * How long the main thread waits for the worker before terminating it and
 * starting a fresh one. Comfortably above the domain's own budget, so a merely
 * slow pattern reports `timed_out` through the normal path.
 */
export const WORKER_TIMEOUT_MS = 2_000;

/** Blank stands for the whole match in List mode; see `WHOLE_MATCH_TOKEN`. */
export const DEFAULT_REPLACEMENT = "";

/**
 * The replacement tokens, in the order the tool lists them. The tokens
 * themselves are `String.prototype.replace` syntax — data, not copy — so they
 * live here and only the descriptions come from the message catalogue.
 *
 * Keeping them out of the messages also avoids a real trap: `$<name>` inside an
 * ICU string parses `<name>` as a rich-text tag.
 */
export const REPLACEMENT_TOKENS = [
    { key: "wholeMatch", token: "$&" },
    { key: "group", token: "$1" },
    { key: "named", token: "$<name>" },
    { key: "before", token: "$`" },
    { key: "after", token: "$'" },
    { key: "escaped", token: "$$" },
] as const;

/**
 * The pattern and input the page opens on. Technical data rather than copy, so
 * it stays out of the message catalogue and reads the same in both locales.
 */
export const SAMPLE_PATTERN = String.raw`^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,6}$`;

export const SAMPLE_TEST_STRING = [
    "ada@example.com",
    "grace.hopper@navy.mil",
    "not-an-email@",
    "katherine.johnson@nasa.gov",
].join("\n");
