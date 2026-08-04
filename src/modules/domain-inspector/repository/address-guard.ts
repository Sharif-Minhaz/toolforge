import "server-only";

import { isIpAddress } from "@/modules/tools/domain/ip";
import { guardAddresses } from "@/modules/tools/repository/address-guard";
import { queryDns } from "./doh";
import type { DnsResolver, PanelFailureReason } from "../types";

/**
 * This tool's half of the address gate: resolution.
 *
 * The classification itself moved to `tools/repository/address-guard.ts` when
 * the Port Scanner needed the same rule. What stayed is the part that is only
 * true here — a name is resolved over DoH, through whichever public resolver
 * the reader picked, because comparing resolvers is what this tool is for.
 */

export type AddressGuardResult =
    | { readonly ok: true; readonly addresses: readonly string[] }
    | { readonly ok: false; readonly reason: PanelFailureReason };

/** Resolves a hostname — or accepts a literal address — and guards the result. */
export async function resolvePublicAddresses(
    hostname: string,
    resolver: DnsResolver,
): Promise<AddressGuardResult> {
    if (isIpAddress(hostname)) {
        return guardAddresses([hostname], "domain_inspector");
    }

    const [v4, v6] = await Promise.all([
        queryDns(hostname, "A", resolver),
        queryDns(hostname, "AAAA", resolver),
    ]);

    // The `isIpAddress` filter is load-bearing, not defensive tidiness: a
    // validating resolver returns the RRSIG alongside the address, and its data
    // is a signature blob. Anything that is not an address is not a place to go.
    const candidates = [...(v4.ok ? v4.answers : []), ...(v6.ok ? v6.answers : [])]
        .map((answer) => answer.data)
        .filter((address) => isIpAddress(address));

    return guardAddresses(candidates, "domain_inspector");
}
