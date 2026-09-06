import "server-only";

import { logEvent } from "@/modules/observability/domain/logger";
import { isIpAddress, classifyAddress } from "../domain/ip";
import { queryDns } from "./doh";
import type { DnsResolver } from "../types/network";

/**
 * The gate every outbound connection to a host somebody typed has to pass.
 *
 * A tool that reaches an address a stranger named is a server-side request
 * forgery surface before it is anything else: without this, anyone could point
 * it at `169.254.169.254` and read the cloud metadata service, or at an
 * internal address and use this server to reach a network it cannot see.
 *
 * Two rules make it hold:
 *
 * - **Resolve first, then decide.** A name is checked by what it answers with,
 *   not by how it is spelled, because `internal.attacker.example` is a public
 *   name that resolves to `10.0.0.1`. `resolvePublicAddresses` does both steps
 *   for a caller resolving over DoH; `guardAddresses` is the second step alone,
 *   for the Port Scanner, which resolves through the platform's own resolver.
 * - **Hand back addresses, not permission.** Callers connect to the address
 *   that was checked rather than re-resolving the name, so a record that
 *   changes between the check and the connection cannot be used to slip past
 *   it. That is the whole reason both return a list instead of a boolean.
 *
 * Lifted out of the Domain Inspector when the Port Scanner needed the same
 * gate — and that tool is exactly the abuse this was written against, which
 * makes it the one place in the repository where the guard is load-bearing
 * rather than precautionary.
 */

export type AddressGuardReason = "no_address" | "blocked_address";

export type AddressGuardResult =
    | { readonly ok: true; readonly addresses: readonly string[] }
    | { readonly ok: false; readonly reason: AddressGuardReason };

export function guardAddresses(
    candidates: readonly string[],
    /** Names the caller in the log line, so a blocked attempt is attributable. */
    source = "tools",
): AddressGuardResult {
    if (candidates.length === 0) {
        return { ok: false, reason: "no_address" };
    }

    const allowed = candidates.filter((address) => classifyAddress(address) === "public");

    if (allowed.length === 0) {
        logEvent("warn", `${source}.blocked_address`, { count: candidates.length });

        return { ok: false, reason: "blocked_address" };
    }

    return { ok: true, addresses: allowed };
}

/**
 * Resolves a hostname over DoH — or accepts a literal address — and guards the
 * result.
 *
 * The resolver is a parameter rather than a constant because which resolver
 * answered is part of what the callers are showing the reader: a lookup they
 * can reproduce with `dig @1.1.1.1` is worth more than one they cannot.
 */
export async function resolvePublicAddresses(
    hostname: string,
    resolver: DnsResolver,
    source = "tools",
): Promise<AddressGuardResult> {
    if (isIpAddress(hostname)) {
        return guardAddresses([hostname], source);
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

    return guardAddresses(candidates, source);
}
