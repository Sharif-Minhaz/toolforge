import type { DnsResolver } from "../types/network";

/**
 * Endpoints, zones and budgets shared by every tool that resolves a name or
 * asks a registry who holds a block.
 *
 * They sit here rather than in a tool's own `constants.ts` because the choice
 * each one encodes — which resolvers answer JSON on 443, where the RDAP
 * bootstrap lives, how long a lookup may hold a report open — is a fact about
 * the upstream, not about the tool asking.
 */

export const DEFAULT_RESOLVER: DnsResolver = "cloudflare";

/**
 * DoH JSON endpoints. All three answer `application/dns-json` on GET, and all
 * three are on 443 — which is the reason Quad9 is not among them despite being
 * the obvious third choice. Its JSON API is served only on port 5053, and a
 * non-standard outbound port is blocked by enough egress firewalls that the
 * control would time out rather than answer. Its wire-format endpoint on 443
 * rejects a `?name=` query outright ("DoH unable to decode BASE64-URL"), so
 * there is nothing to fall back to. Verify any replacement on 443 before
 * adding it.
 */
export const RESOLVER_ENDPOINTS: Record<DnsResolver, string> = {
    cloudflare: "https://cloudflare-dns.com/dns-query",
    google: "https://dns.google/resolve",
    dnssb: "https://doh.sb/dns-query",
};

/** Each lookup gets its own budget, so one slow upstream cannot stall the rest. */
export const DNS_TIMEOUT_MS = 6_000;
export const RDAP_TIMEOUT_MS = 8_000;

/**
 * IANA's bootstrap redirector. One request finds the registry that is
 * authoritative for a TLD instead of shipping a copy of the bootstrap file
 * that goes stale the week a new TLD delegates its RDAP service.
 */
export const RDAP_BOOTSTRAP_URL = "https://rdap.org";

/**
 * Team Cymru answer origin and AS-name queries over plain DNS TXT, which means
 * they can ride the same DoH transport as everything else here — no whois
 * socket, no key, no account.
 */
export const CYMRU_ORIGIN_ZONE = "origin.asn.cymru.com";
export const CYMRU_ORIGIN6_ZONE = "origin6.asn.cymru.com";
export const CYMRU_AS_ZONE = "asn.cymru.com";

/** DNS numeric type codes, for the `type=` parameter of a DoH query. */
export const DNS_TYPE_CODES = {
    A: 1,
    NS: 2,
    CNAME: 5,
    SOA: 6,
    PTR: 12,
    MX: 15,
    TXT: 16,
    AAAA: 28,
    DS: 43,
    CAA: 257,
} as const;
