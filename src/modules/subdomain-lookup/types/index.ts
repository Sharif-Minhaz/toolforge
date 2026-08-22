/**
 * One name on file, as the index holds it.
 *
 * `firstSeen` is when the index first saw the name — in a certificate, a zone
 * file, or a crawl — and not when the name was created, nor when it last
 * answered DNS. It is `null` for names that arrived through a source carrying
 * no date at all, which is common enough that the UI must not treat a missing
 * date as an error.
 */
export type SubdomainRecord = {
    /** Lower-cased, ASCII. The apex itself appears here when the index holds it. */
    readonly name: string;
    /** Everything left of the apex, or `null` for the apex row itself. */
    readonly label: string | null;
    /** Labels between this name and the apex: `api.example.com` is 1. */
    readonly depth: number;
    /** ISO-8601 instant, or `null` when the source carried no date. */
    readonly firstSeen: string | null;
};

/**
 * How the list is ordered.
 *
 * `hierarchy` is the default and compares labels **right to left**, so
 * `api.staging.example.com` sorts next to `db.staging.example.com` rather than
 * next to `api.example.com`. That is how a person reads a subdomain tree, and
 * plain alphabetical order scatters it.
 */
export const SUBDOMAIN_SORTS = ["hierarchy", "name", "newest", "oldest", "depth"] as const;

export type SubdomainSort = (typeof SUBDOMAIN_SORTS)[number];

export type SubdomainSummary = {
    /** Records kept, which equals records found unless `truncated` is true. */
    readonly total: number;
    /** True when the record cap bit and this report is a prefix of the index. */
    readonly truncated: boolean;
    /** Names the index actually returned, before the cap. */
    readonly returned: number;
    /** Whether the apex itself is among them. */
    readonly apexIncluded: boolean;
    /** Deepest name, in labels below the apex. */
    readonly maxDepth: number;
    /** How many carry a first-seen date at all. */
    readonly dated: number;
    readonly newestAt: string | null;
    readonly oldestAt: string | null;
    /** Dated inside the recent window, measured from the server's clock. */
    readonly recent: number;
};

/**
 * What is left of this visitor's allowance after the lookup that produced it.
 *
 * Carried on refusals too, because somebody who has run out needs to know that
 * before they retype the domain.
 */
export type LookupAllowance = {
    readonly remaining: number;
    /**
     * Epoch **seconds**. An instant rather than a duration, because a countdown
     * computed here is already wrong by the time it is painted — and because the
     * MCP caller reading this is a program deciding when to try again.
     */
    readonly resetsAt: number;
};

export type LookupFailureReason =
    | "empty_input"
    | "too_long"
    | "invalid_hostname"
    | "unknown_suffix"
    | "ip_address"
    | "apex_too_large"
    | "upstream_refused"
    | "upstream_exhausted"
    | "upstream_unavailable"
    | "response_too_large"
    | "rate_limited"
    | "not_configured";

export type LookupFailure = {
    readonly ok: false;
    readonly reason: LookupFailureReason;
    /** Present whenever the allowance was reached before the failure. */
    readonly allowance?: LookupAllowance;
};

export type SubdomainReport = {
    readonly ok: true;
    /** The eTLD+1 actually queried, which may not be what was typed. */
    readonly apex: string;
    /**
     * Set when the reader typed a name below the apex and the lookup was widened
     * to its registrable domain. The UI says so rather than silently answering a
     * different question.
     */
    readonly narrowedFrom: string | null;
    readonly records: readonly SubdomainRecord[];
    readonly summary: SubdomainSummary;
    /** ISO-8601, stamped on the server so both locales format one instant. */
    readonly fetchedAt: string;
    readonly allowance: LookupAllowance | null;
};

export type LookupResult = SubdomainReport | LookupFailure;

/** The two counters this tool meters on. See `repository/quota.ts`. */
export type LookupQuotaBucket = "address" | "service";
