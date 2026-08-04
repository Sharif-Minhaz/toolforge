import "server-only";

import { Resolver } from "node:dns/promises";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { detectIpVersion, isIpAddress } from "@/modules/tools/domain/ip";
import { guardAddresses } from "@/modules/tools/repository/address-guard";
import type { IpVersion } from "@/modules/tools/types";
import type { ScanFailureReason } from "../types";

/**
 * Turns what somebody typed into the single address this scan may connect to.
 *
 * The Domain Inspector resolves over DoH because comparing resolvers is what
 * that tool is *for*. Here the resolver is not the subject, so the platform's
 * own is right — one fewer outbound dependency in front of a feature that is
 * already reaching a stranger's host.
 *
 * The guard runs on what came back, never on what was typed:
 * `metadata.attacker.example` is a perfectly well-formed public name that
 * resolves to `169.254.169.254`.
 */

export type ResolvedTarget =
    | { readonly ok: true; readonly address: string; readonly version: IpVersion }
    | { readonly ok: false; readonly reason: ScanFailureReason };

/** A resolver of its own, so a slow authority cannot hold a request open. */
function createResolver(timeoutMs: number): Resolver {
    return new Resolver({ timeout: timeoutMs, tries: 2 });
}

async function lookupBoth(hostname: string, timeoutMs: number): Promise<readonly string[]> {
    const resolver = createResolver(timeoutMs);

    const [v4, v6] = await Promise.all([
        resolver.resolve4(hostname).catch(() => []),
        resolver.resolve6(hostname).catch(() => []),
    ]);

    // The filter is load-bearing rather than tidiness: anything that is not an
    // address is not a place to open a socket to.
    return [...v4, ...v6].filter((address) => isIpAddress(address));
}

export async function resolveScanTarget(
    hostname: string,
    timeoutMs: number,
): Promise<ResolvedTarget> {
    try {
        const candidates = isIpAddress(hostname)
            ? [hostname]
            : await lookupBoth(hostname, timeoutMs);

        if (candidates.length === 0) {
            return { ok: false, reason: "unresolved" };
        }

        const guarded = guardAddresses(candidates, "port_scanner");

        if (!guarded.ok) {
            return { ok: false, reason: guarded.reason };
        }

        // One address, not all of them. A name with six A records is six hosts
        // to a scanner, and scanning all of them off one press is six times the
        // traffic the reader asked for. The first is what a client would have
        // connected to, and the report names it so the reader knows which.
        const address = guarded.addresses[0];
        const version = detectIpVersion(address);

        if (version === null) {
            return { ok: false, reason: "unresolved" };
        }

        return { ok: true, address, version };
    } catch (caught) {
        logEvent("warn", "port_scanner.resolve_failed", { error: describeError(caught) });

        return { ok: false, reason: "unresolved" };
    }
}
