import "server-only";

import { CYMRU_AS_ZONE } from "../domain/constants";
import { parseCymruAsName, parseCymruOrigin, stripRootDot } from "../domain/dns";
import { cymruOriginName, detectIpVersion, reverseArpaName } from "../domain/ip";
import { queryDns, queryTxtValue } from "./doh";
import { fetchNetworkInfo } from "./rdap";
import type { DnsResolver, HostAddress } from "../types";

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
 * leaves a `null` field, never a failed panel.
 */
export async function describeAddress(ip: string, resolver: DnsResolver): Promise<HostAddress> {
    const arpa = reverseArpaName(ip);
    const originName = cymruOriginName(ip);

    const [reverse, origin, network] = await Promise.all([
        arpa === null ? Promise.resolve(null) : lookupReverse(arpa, resolver),
        originName === null ? Promise.resolve(null) : queryTxtValue(originName, resolver),
        fetchNetworkInfo(ip),
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
        reverse,
        asn: parsedOrigin?.asn ?? null,
        asName,
        prefix: parsedOrigin?.prefix ?? null,
        // The routing registry is the better authority on the country; Cymru's
        // is derived from the same allocation and is the fallback.
        country: network?.country ?? parsedOrigin?.country ?? null,
        registry: parsedOrigin?.registry ?? null,
        network: network?.network ?? null,
        org: network?.org ?? null,
    };
}

async function lookupReverse(arpaName: string, resolver: DnsResolver): Promise<string | null> {
    const result = await queryDns(arpaName, "PTR", resolver);

    if (!result.ok || result.answers.length === 0) {
        return null;
    }

    return stripRootDot(result.answers[0].data);
}
