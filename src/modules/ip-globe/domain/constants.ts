import { DEFAULT_RESOLVER } from "@/modules/tools/domain/network-constants";
import type { RouteOptions } from "../types";

/**
 * Every ceiling this tool enforces, and the reason each one is where it is.
 */

/**
 * The input is a content box in both modes — a host list or a pasted trace — so
 * it is never capped with `maxLength`. Truncating a traceroute silently would
 * produce a shorter route that still looks complete, which is worse than
 * refusing it. The meter and the refusal below the box do the work instead.
 */
export const MAX_INPUT_LENGTH = 8_000;

/**
 * `traceroute` defaults to 30 hops and `tracert` to 30; `mtr` will go to 64 if
 * asked. Forty is past every default and short of the point where one press
 * becomes a hundred registry lookups.
 */
export const MAX_HOPS = 40;

/**
 * Each located hop costs a reverse lookup, two Cymru queries and an RDAP
 * request. Twenty hosts is a generous list and still a bounded number of round
 * trips.
 */
export const MAX_HOSTS = 20;

/**
 * How many hops are looked up at once. The upstreams are public services none
 * of which we operate, so this is politeness as much as it is throughput: a
 * forty-hop trace fired at Team Cymru all at once is a burst worth not sending.
 */
export const LOOKUP_CONCURRENCY = 4;

/**
 * No Turnstile, and the reason is what this tool does *not* do.
 *
 * The Port Scanner and the Domain Inspector make this server touch a machine a
 * stranger named, and a human proof is what stands between that and a free
 * anonymous scanner. Nothing here does: every request goes to a public resolver,
 * to Team Cymru's TXT zones, or to the RDAP bootstrap — all of them readable by
 * anybody without a token, all of them at fixed addresses, and none of them the
 * host being asked about. No packet reaches the machine on the map.
 *
 * What is actually at risk is throughput against upstreams nobody here operates,
 * and a quota is the gate shaped like that. See `repository/quota.ts`.
 */

/** Routes one address may map in a window. */
export const QUOTA_LIMIT_PER_ADDRESS = 15;

/**
 * Routes the whole deployment may map in a window.
 *
 * Team Cymru and rdap.org answer for free and meter by address — and the
 * address they see is this deployment's, so every reader's route is charged
 * against one shared allowance. Without this counter, one caller in a loop
 * spends it for everybody and quite possibly gets this server blocked.
 */
export const QUOTA_LIMIT_PER_DEPLOYMENT = 60;

export const QUOTA_WINDOW_MS = 60 * 60 * 1_000;

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
    mode: "hosts",
    resolver: DEFAULT_RESOLVER,
    autoRotate: true,
    showArcs: true,
    groupByCountry: true,
};
