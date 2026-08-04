import type { IpVersion } from "../types";

/**
 * Address arithmetic, kept pure so the guard that decides whether this server
 * may talk to an address is unit-tested rather than trusted.
 *
 * The classification is deliberately strict. Everything this file cannot prove
 * is a globally routable address is `restricted`, because the cost of being
 * wrong in that direction is a refused lookup, and the cost of being wrong in
 * the other is a stranger using this server to reach the private network it
 * sits in.
 */

export type AddressClass = "public" | "restricted" | "invalid";

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

/**
 * Strict on purpose: `010.0.0.1` is octal to some resolvers and decimal to
 * others, and an ambiguous address is exactly the kind a filter is meant to
 * catch rather than normalise.
 */
export function parseIpv4(input: string): readonly number[] | null {
    const matched = IPV4_PATTERN.exec(input);

    if (matched === null) {
        return null;
    }

    const octets = matched.slice(1).map((part) => {
        if (part.length > 1 && part.startsWith("0")) {
            return Number.NaN;
        }

        return Number(part);
    });

    return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
        ? octets
        : null;
}

/** Returns the eight 4-digit groups of an IPv6 address, `::` expanded. */
export function expandIpv6(input: string): readonly string[] | null {
    let text = input.trim().toLowerCase();

    if (text.length === 0 || text.includes(":::")) {
        return null;
    }

    // A trailing dotted quad — `::ffff:192.0.2.1` — is rewritten to two hex
    // groups so the rest of the function only ever sees one notation.
    const lastColon = text.lastIndexOf(":");

    if (lastColon !== -1 && text.slice(lastColon + 1).includes(".")) {
        const embedded = parseIpv4(text.slice(lastColon + 1));

        if (embedded === null) {
            return null;
        }

        const high = ((embedded[0] << 8) | embedded[1]).toString(16);
        const low = ((embedded[2] << 8) | embedded[3]).toString(16);

        text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
    }

    const halves = text.split("::");

    if (halves.length > 2) {
        return null;
    }

    const head = halves[0].length > 0 ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1].length > 0 ? halves[1].split(":") : [];

    let groups: string[];

    if (halves.length === 1) {
        if (head.length !== 8) {
            return null;
        }

        groups = head;
    } else {
        const fill = 8 - head.length - tail.length;

        // `::` has to stand for at least one group, or the address should have
        // been written out in full.
        if (fill < 1) {
            return null;
        }

        groups = [...head, ...Array.from({ length: fill }, () => "0"), ...tail];
    }

    return groups.every((group) => IPV6_GROUP_PATTERN.test(group))
        ? groups.map((group) => group.padStart(4, "0"))
        : null;
}

export function detectIpVersion(input: string): IpVersion | null {
    if (parseIpv4(input) !== null) {
        return 4;
    }

    return expandIpv6(input) !== null ? 6 : null;
}

export function isIpAddress(input: string): boolean {
    return detectIpVersion(input) !== null;
}

/** True for every IPv4 range that is not globally routable. */
function isRestrictedIpv4(octets: readonly number[]): boolean {
    const [a, b, c] = octets;

    return (
        a === 0 || // "this network"
        a === 10 || // RFC 1918
        a === 127 || // loopback
        (a === 100 && b >= 64 && b <= 127) || // RFC 6598 carrier-grade NAT
        (a === 169 && b === 254) || // link-local
        (a === 172 && b >= 16 && b <= 31) || // RFC 1918
        (a === 192 && b === 0 && (c === 0 || c === 2)) || // protocol assignments, TEST-NET-1
        (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
        (a === 192 && b === 168) || // RFC 1918
        (a === 198 && (b === 18 || b === 19)) || // benchmarking
        (a === 198 && b === 51 && c === 100) || // TEST-NET-2
        (a === 203 && b === 0 && c === 113) || // TEST-NET-3
        a >= 224 // multicast, reserved, broadcast
    );
}

function isRestrictedIpv6(groups: readonly string[]): boolean {
    const values = groups.map((group) => Number.parseInt(group, 16));
    const [first, second] = values;

    // `::` and `::1`.
    if (values.slice(0, 7).every((value) => value === 0) && values[7] <= 1) {
        return true;
    }

    // IPv4-mapped and NAT64 both carry a v4 address in the low 32 bits, and it
    // is that address the connection would actually reach.
    const mapsIpv4 =
        (values.slice(0, 5).every((value) => value === 0) && values[5] === 0xffff) ||
        (first === 0x0064 && second === 0xff9b);

    if (mapsIpv4) {
        const embedded = [values[6] >> 8, values[6] & 0xff, values[7] >> 8, values[7] & 0xff];

        return isRestrictedIpv4(embedded);
    }

    // A 6to4 address carries its IPv4 in the next two groups, and that is the
    // address a relay would ultimately deliver to.
    if (first === 0x2002) {
        const embedded = [second >> 8, second & 0xff, values[2] >> 8, values[2] & 0xff];

        return isRestrictedIpv4(embedded);
    }

    return (
        first === 0x0100 || // discard-only
        (first === 0x2001 && second <= 0x01ff) || // IETF protocol assignments, incl. Teredo
        (first === 0x2001 && second === 0x0db8) || // documentation
        (first & 0xfe00) === 0xfc00 || // unique local
        (first & 0xffc0) === 0xfe80 || // link-local
        (first & 0xff00) === 0xff00 // multicast
    );
}

/**
 * The one question the SSRF guard asks. `restricted` covers loopback, every
 * private and link-local range, carrier-grade NAT, documentation ranges, and
 * multicast — none of which a stranger's domain has any business resolving to.
 */
export function classifyAddress(input: string): AddressClass {
    const octets = parseIpv4(input);

    if (octets !== null) {
        return isRestrictedIpv4(octets) ? "restricted" : "public";
    }

    const groups = expandIpv6(input);

    if (groups !== null) {
        return isRestrictedIpv6(groups) ? "restricted" : "public";
    }

    return "invalid";
}

export function isPublicAddress(input: string): boolean {
    return classifyAddress(input) === "public";
}

/**
 * The 32 nibbles of an IPv6 address, most significant first.
 *
 * Exported because the reversed-name forms built on it — PTR names, and the
 * origin zones an ASN lookup rides — belong to the tool that queries them, not
 * here. This file stays address arithmetic and nothing else.
 */
export function ipv6Nibbles(groups: readonly string[]): readonly string[] {
    return groups.join("").split("");
}
