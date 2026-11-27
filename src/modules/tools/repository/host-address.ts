import "server-only";

import {
    parseCymruAsName,
    parseCymruOrigin,
    readReverseAnswer,
    type ReverseOutcome,
} from "../domain/dns";
import { detectIpVersion } from "../domain/ip";
import {
    CYMRU_AS_ZONE,
    RESOLVER_ENDPOINTS,
    REVERSE_FALLBACK_RESOLVER,
    REVERSE_RETRY_TIMEOUT_MS,
} from "../domain/network-constants";
import { cymruOriginName, reverseArpaName } from "../domain/reverse-names";
import { queryDns, queryDnsAt, queryTxtValue } from "./doh";
import { fetchNetworkInfo } from "./rdap";
import type { DnsResolver, HostAddress, HostRouting } from "../types/network";

/**
 * Who runs the machine behind an address.
 *
 * Three sources, none of which needs an account: the reverse name the operator
 * publishes, Team Cymru's origin zones for the ASN and its announced prefix,
 * and the routing registry's own record for the block. Between them they answer
 * "which network is this, and who was allocated it" — which is a claim that can
 * be checked, unlike a geo-IP database's guess at a city.
 *
 * Every source is optional. A missing PTR or a registry that declines to answer
 * leaves a `null` field, never a failed lookup. The reverse name also carries
 * `reverseFailed`, because a PTR that could not be fetched and one that does
 * not exist both arrive as `null`, and only the second may be shown as absent.
 */
export async function describeAddress(ip: string, resolver: DnsResolver): Promise<HostAddress> {
    const [routing, network] = await Promise.all([
        describeRouting(ip, resolver),
        fetchNetworkInfo(ip),
    ]);

    return {
        ...routing,
        // The routing registry is the better authority on the country; Cymru's
        // is derived from the same allocation and is the fallback.
        country: network?.country ?? routing.country,
        network: network?.network ?? null,
        org: network?.org ?? null,
    };
}

/**
 * The DNS half of `describeAddress`, on its own: the reverse name and Team
 * Cymru's origin and AS-name zones, without the RDAP request.
 *
 * Separate because RDAP registries meter by calling address — which is this
 * server's — while these answers come through a public DoH resolver that caches
 * them for hours. A page that looks one up on every view, rather than behind a
 * quota, can afford this half and not the other.
 */
export async function describeRouting(ip: string, resolver: DnsResolver): Promise<HostRouting> {
    const arpa = reverseArpaName(ip);
    const originName = cymruOriginName(ip);

    const [reverse, origin] = await Promise.all([
        arpa === null
            ? Promise.resolve<ReverseOutcome>({ kind: "absent" })
            : lookupReverse(arpa, resolver),
        originName === null ? Promise.resolve(null) : queryTxtValue(originName, resolver),
    ]);

    const parsedOrigin = origin === null ? null : parseCymruOrigin(origin);
    const asName =
        parsedOrigin?.asn === undefined || parsedOrigin?.asn === null
            ? null
            : parseCymruAsName(
                  (await queryTxtValue(`AS${parsedOrigin.asn}.${CYMRU_AS_ZONE}`, resolver)) ?? "",
              );

    return {
        ip,
        version: detectIpVersion(ip) ?? 4,
        reverse: reverse.kind === "found" ? reverse.name : null,
        reverseFailed: reverse.kind === "failed",
        asn: parsedOrigin?.asn ?? null,
        asName,
        prefix: parsedOrigin?.prefix ?? null,
        country: parsedOrigin?.country ?? null,
        registry: parsedOrigin?.registry ?? null,
    };
}

/**
 * The PTR record, asked of a second resolver when the first gets no answer.
 * An `absent` answer is final; only a failed one is worth asking again.
 */
async function lookupReverse(arpaName: string, resolver: DnsResolver): Promise<ReverseOutcome> {
    const first = readReverseAnswer(await queryDns(arpaName, "PTR", resolver));

    if (first.kind !== "failed") {
        return first;
    }

    const fallback = REVERSE_FALLBACK_RESOLVER[resolver];

    return readReverseAnswer(
        await queryDnsAt(
            RESOLVER_ENDPOINTS[fallback],
            fallback,
            arpaName,
            "PTR",
            REVERSE_RETRY_TIMEOUT_MS,
        ),
    );
}
