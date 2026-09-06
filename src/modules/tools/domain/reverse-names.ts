import { expandIpv6, ipv6Nibbles, parseIpv4 } from "./ip";
import { CYMRU_ORIGIN6_ZONE, CYMRU_ORIGIN_ZONE } from "./network-constants";

/**
 * The two reversed-nibble names a caller asks a resolver for: the PTR name for
 * an address, and Team Cymru's origin zone for the ASN that announces it.
 *
 * Both are the same arithmetic in different zones, which is why they sit
 * together rather than beside the address maths in `ip.ts`.
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
