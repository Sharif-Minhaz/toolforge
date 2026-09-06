/**
 * The shapes the IP & Route Globe speaks.
 *
 * Everything here is serialisable: the whole route crosses a Server Action
 * boundary, so nothing holds a socket, a canvas, or a function.
 *
 * The central decision is in `Hop.coords`. A hop is placed by the *country* its
 * address block was allocated to, taken from the routing registry — never from
 * a geo-IP database's guess at a city. That is the honest resolution for the
 * data underneath, and it is why `coords` is a country centroid and why several
 * hops routinely share one. See `tools/domain/countries.ts`.
 */

import type { HostAddress } from "@/modules/tools/types/network";

/** Which dialect of input the reader is handing over. */
export const ROUTE_MODES = ["hosts", "traceroute"] as const;

export type RouteMode = (typeof ROUTE_MODES)[number];

/**
 * Why a hop is or is not on the globe.
 *
 * Five ways to be absent, kept apart because they are five different findings.
 * "The router did not answer" and "the registry did not say which country"
 * would both be a missing dot; only one of them is worth checking again.
 */
export const HOP_STATUSES = [
    "located",
    "no_country",
    "private_range",
    "timed_out",
    "unresolvable",
    "blocked_address",
] as const;

export type HopStatus = (typeof HOP_STATUSES)[number];

/** A hop as it was read out of the input, before anything was looked up. */
export type ParsedHop = {
    /** 1-based. The TTL for a traceroute, the line's position for a host list. */
    readonly index: number;
    /** What the input called it — a hostname, an address, or both. */
    readonly label: string;
    /** The literal address, when the input carried one. */
    readonly ip: string | null;
    /** The name, when the input carried one alongside the address. */
    readonly hostname: string | null;
    /** Round-trip time in milliseconds, where the input reported one. */
    readonly rttMs: number | null;
    /** The probe went unanswered — `* * *`, `???`, "Request timed out". */
    readonly timedOut: boolean;
};

export type Hop = ParsedHop & {
    readonly status: HopStatus;
    /** Registry data for the address, once it has been looked up. */
    readonly address: HostAddress | null;
    /** `[latitude, longitude]` of the allocation country's centroid. */
    readonly coords: readonly [number, number] | null;
};

/** What the whole route adds up to, for the summary strip and the globe's label. */
export type RouteSummary = {
    readonly total: number;
    readonly located: number;
    /** ISO 3166-1 alpha-2 codes, in the order first reached. */
    readonly countries: readonly string[];
    /** Distinct autonomous systems crossed, in the order first reached. */
    readonly asns: readonly number[];
    /** Sum of the reported round-trip times, or `null` when none were reported. */
    readonly totalRttMs: number | null;
};

export type RouteReport = {
    readonly mode: RouteMode;
    readonly hops: readonly Hop[];
    readonly summary: RouteSummary;
    /** ISO 8601, so the reader knows how old the answer is. */
    readonly checkedAt: string;
};

/** Which ceiling refused a route, so the message can say which. */
export const ROUTE_QUOTA_BUCKETS = ["address", "service"] as const;

export type RouteQuotaBucket = (typeof ROUTE_QUOTA_BUCKETS)[number];

/**
 * How the whole request can be refused. The last three come from the shared
 * Turnstile verifier and the quota, so they are spelled the way those spell
 * them rather than renamed on the way through.
 */
export type RouteFailureReason =
    | "empty_input"
    | "input_too_long"
    | "too_many_hops"
    | "no_hops_found"
    | "unsupported_trace_format"
    | "invalid_hostname"
    | "rate_limited"
    | "lookup_failed";

export type RouteResult =
    | { readonly ok: true; readonly report: RouteReport }
    | { readonly ok: false; readonly reason: RouteFailureReason };

/** A parse that stopped short, with the reason kept rather than collapsed. */
export type ParseFailure = {
    readonly ok: false;
    readonly reason: Extract<
        RouteFailureReason,
        | "empty_input"
        | "input_too_long"
        | "too_many_hops"
        | "no_hops_found"
        | "unsupported_trace_format"
    >;
    /** How many hops were found, when the ceiling is what refused it. */
    readonly count?: number;
};

export type ParseResult = { readonly ok: true; readonly hops: readonly ParsedHop[] } | ParseFailure;

/** Everything the reader can turn before pressing the button. */
export type RouteOptions = {
    readonly mode: RouteMode;
    readonly resolver: import("@/modules/tools/types/network").DnsResolver;
    readonly autoRotate: boolean;
    readonly showArcs: boolean;
    /**
     * Collapse hops sharing an allocation country onto one marker.
     *
     * On by default, and the honest default: ten hops inside one country all
     * resolve to one centroid, so ten markers stacked on one point would read
     * as a precision the data does not have.
     */
    readonly groupByCountry: boolean;
};

/** One dot on the globe, in the units COBE takes. */
export type GlobeMarker = {
    /** `[latitude, longitude]`. */
    readonly location: readonly [number, number];
    readonly size: number;
    /** Which hops this dot stands for, 1-based, so the table can be linked to it. */
    readonly hops: readonly number[];
    readonly country: string;
};

/** One curve between two dots. */
export type GlobeArc = {
    readonly from: readonly [number, number];
    readonly to: readonly [number, number];
};
