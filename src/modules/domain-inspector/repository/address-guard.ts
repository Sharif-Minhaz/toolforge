import "server-only";

import { logEvent } from "@/modules/observability/domain/logger";
import { classifyAddress, isIpAddress } from "../domain/ip";
import { queryDns } from "./doh";
import type { DnsResolver, PanelFailureReason } from "../types";

/**
 * The gate every outbound connection this tool makes has to pass.
 *
 * A tool that fetches a hostname a stranger typed is a server-side request
 * forgery surface before it is anything else: without this, anyone could point
 * it at `169.254.169.254` and read the cloud metadata service, or at an
 * internal address and use this server as a port scanner with this site's
 * reputation attached.
 *
 * Two rules make it hold:
 *
 * - **Resolve first, then decide.** A name is checked by what it answers with,
 *   not by how it is spelled, because `internal.attacker.example` is a public
 *   name that resolves to `10.0.0.1`.
 * - **Hand back addresses, not permission.** Callers connect to the address
 *   that was checked rather than re-resolving the name, so a record that
 *   changes between the check and the connection cannot be used to slip past
 *   it. That is the whole reason this returns a list instead of a boolean.
 */

export type AddressGuardResult =
    | { readonly ok: true; readonly addresses: readonly string[] }
    | { readonly ok: false; readonly reason: PanelFailureReason };

export function guardAddresses(candidates: readonly string[]): AddressGuardResult {
    if (candidates.length === 0) {
        return { ok: false, reason: "no_address" };
    }

    const allowed = candidates.filter((address) => classifyAddress(address) === "public");

    if (allowed.length === 0) {
        logEvent("warn", "domain_inspector.blocked_address", { count: candidates.length });

        return { ok: false, reason: "blocked_address" };
    }

    return { ok: true, addresses: allowed };
}

/** Resolves a hostname — or accepts a literal address — and guards the result. */
export async function resolvePublicAddresses(
    hostname: string,
    resolver: DnsResolver,
): Promise<AddressGuardResult> {
    if (isIpAddress(hostname)) {
        return guardAddresses([hostname]);
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

    return guardAddresses(candidates);
}
