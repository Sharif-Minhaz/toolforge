import { expandIpv6, ipv6Nibbles, parseIpv4 } from "@/modules/tools/domain/ip";
import { CYMRU_ORIGIN6_ZONE, CYMRU_ORIGIN_ZONE } from "./constants";

/**
 * The two reversed-nibble names this tool asks a resolver for.
 *
 * They stayed behind when the address arithmetic moved to `tools/domain/ip.ts`,
 * because only this tool queries either of them — and `cymruOriginName` is the
 * one that made the split obvious, since it needs a zone name that is this
 * module's constant, not a shared one.
 */

/** `1.2.3.4` → `4.3.2.1.in-addr.arpa`, and the nibble form for IPv6. */
export function reverseArpaName(input: string): string | null {
    const octets = parseIpv4(input);

    if (octets !== null) {
        return `${[...octets].reverse().join(".")}.in-addr.arpa`;
    }

    const groups = expandIpv6(input);

    return groups === null ? null : `${[...ipv6Nibbles(groups)].reverse().join(".")}.ip6.arpa`;
}

/**
 * Team Cymru's origin zone takes the same reversed form as a PTR name, which is
 * what lets an ASN lookup ride the DoH transport instead of needing whois.
 */
export function cymruOriginName(input: string): string | null {
    const octets = parseIpv4(input);

    if (octets !== null) {
        return `${[...octets].reverse().join(".")}.${CYMRU_ORIGIN_ZONE}`;
    }

    const groups = expandIpv6(input);

    return groups === null
        ? null
        : `${[...ipv6Nibbles(groups)].reverse().join(".")}.${CYMRU_ORIGIN6_ZONE}`;
}
