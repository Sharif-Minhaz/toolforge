import "server-only";

import { logEvent } from "@/modules/observability/domain/logger";
import { classifyAddress } from "../domain/ip";

/**
 * The gate every outbound connection to a host somebody typed has to pass.
 *
 * A tool that reaches an address a stranger named is a server-side request
 * forgery surface before it is anything else: without this, anyone could point
 * it at `169.254.169.254` and read the cloud metadata service, or at an
 * internal address and use this server to reach a network it cannot see.
 *
 * Two rules make it hold, and only the second is visible in this signature:
 *
 * - **Resolve first, then decide.** A name is checked by what it answers with,
 *   not by how it is spelled, because `internal.attacker.example` is a public
 *   name that resolves to `10.0.0.1`. Resolution is the caller's job because
 *   the two tools that need it resolve differently — one over DoH through a
 *   resolver the reader picked, one over the platform's own resolver.
 * - **Hand back addresses, not permission.** Callers connect to the address
 *   that was checked rather than re-resolving the name, so a record that
 *   changes between the check and the connection cannot be used to slip past
 *   it. That is the whole reason this returns a list instead of a boolean.
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
