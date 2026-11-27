/**
 * The shapes every tool that talks to a name server or a routing registry
 * speaks.
 *
 * These lived in the Domain Inspector until a second tool needed to ask the
 * same questions of an address. Nothing here describes a panel or a report —
 * that is the difference between what belongs to a tool and what belongs to the
 * transport underneath it.
 *
 * Everything is serialisable: these cross a Server Action boundary, so dates
 * are ISO strings and nothing holds a socket or a function.
 */

import type { IpVersion } from ".";

/** Public resolvers a reader can choose between, all of which speak DoH JSON. */
export const DNS_RESOLVERS = ["cloudflare", "google", "dnssb"] as const;

export type DnsResolver = (typeof DNS_RESOLVERS)[number];

/**
 * The ways a lookup can stop short.
 *
 * Each one is a distinct finding a caller may want to word differently, which
 * is why they are nine names rather than one `failed`. A tool that can fail in
 * ways of its own widens this union rather than replacing it, so a reason
 * raised down in the transport keeps its name all the way to the message
 * catalogue.
 */
export const DNS_FAILURE_REASONS = [
    "timeout",
    "network_error",
    "nxdomain",
    "no_records",
    "unsupported_tld",
    "unreadable_response",
    /** SERVFAIL, REFUSED and every other RCODE that is neither an answer nor NXDOMAIN. */
    "server_failure",
    "no_address",
    "blocked_address",
] as const;

export type DnsFailureReason = (typeof DNS_FAILURE_REASONS)[number];

/**
 * What DNS alone says about an address: its reverse name, and Team Cymru's
 * record of the AS announcing it.
 *
 * `country` comes from the routing registry's allocation record, never from a
 * geo-IP database: it says which country a block was assigned to, which is a
 * claim that can be checked, rather than where something guesses the machine
 * is. Anything drawing this on a map owes the reader that resolution — see
 * `tools/domain/countries.ts`.
 */
export type HostRouting = {
    readonly ip: string;
    readonly version: IpVersion;
    readonly reverse: string | null;
    /**
     * `true` when no resolver answered the PTR query. Only then is a `null`
     * `reverse` unknown rather than absent, so a panel must not word it as
     * "not found".
     */
    readonly reverseFailed: boolean;
    readonly asn: number | null;
    readonly asName: string | null;
    readonly prefix: string | null;
    /** ISO 3166-1 alpha-2, from the routing registry rather than a geo-IP guess. */
    readonly country: string | null;
    readonly registry: string | null;
};

/** Who runs the machine behind an address: the routing view plus the RDAP record. */
export type HostAddress = HostRouting & {
    readonly network: string | null;
    readonly org: string | null;
};
