import "server-only";

import { classifyAddress, isIpAddress } from "@/modules/tools/domain/ip";
import { resolvePublicAddresses } from "@/modules/tools/repository/address-guard";
import { describeAddress } from "@/modules/tools/repository/host-address";
import type { DnsResolver } from "@/modules/tools/types/network";

import { LOOKUP_CONCURRENCY } from "../domain/constants";
import { toHop, type HopLookup } from "../domain/hops";
import { summarizeRoute } from "../domain/summary";
import type { Hop, ParsedHop, RouteMode, RouteReport } from "../types";

/**
 * Turning parsed hops into located ones.
 *
 * Every hop is independent, so the shape is a bounded fan-out rather than a
 * sequence: a forty-hop trace done one at a time would take most of a minute,
 * and done all at once would be a burst at three public services none of which
 * is ours. `LOOKUP_CONCURRENCY` is the middle.
 *
 * The address gate runs on what DNS returned, never on what was typed — and the
 * address it approved is the address the registry lookups are keyed on, so a
 * record that changes between the check and the query cannot be used to slip
 * past it.
 */
export async function locateRoute(
    hops: readonly ParsedHop[],
    mode: RouteMode,
    resolver: DnsResolver,
): Promise<RouteReport> {
    const located = await mapWithConcurrency(hops, LOOKUP_CONCURRENCY, async (parsed) =>
        toHop(parsed, await lookupHop(parsed, resolver)),
    );

    return {
        mode,
        hops: located,
        summary: summarizeRoute(located),
        checkedAt: new Date().toISOString(),
    };
}

/**
 * What one hop turns out to be.
 *
 * A private address is answered here rather than by the guard, so somebody whose
 * first two hops are their own router is told exactly that instead of watching
 * them fail. It is also the common case: every trace from a home network starts
 * inside one.
 */
async function lookupHop(parsed: ParsedHop, resolver: DnsResolver): Promise<HopLookup> {
    if (parsed.timedOut) {
        return { ok: false, reason: "timed_out" };
    }

    if (parsed.ip !== null) {
        const classification = classifyAddress(parsed.ip);

        if (classification !== "public") {
            // `restricted` is the reader's own network — a router that is really
            // there and has no registry entry. `invalid` is a hop this parser
            // read wrongly. Neither is this server refusing to go somewhere.
            return { ok: false, reason: "private_range" };
        }

        return { ok: true, address: await describeAddress(parsed.ip, resolver) };
    }

    if (parsed.hostname === null) {
        return { ok: false, reason: "unresolvable" };
    }

    const guarded = await resolvePublicAddresses(parsed.hostname, resolver, "ip_globe");

    if (!guarded.ok) {
        // A name that resolved only to addresses the guard refused is not the
        // same finding as one that resolved to nothing at all.
        return {
            ok: false,
            reason: guarded.reason === "blocked_address" ? "blocked_address" : "unresolvable",
        };
    }

    const first = guarded.addresses.find((candidate) => isIpAddress(candidate));

    if (first === undefined) {
        return { ok: false, reason: "unresolvable" };
    }

    return { ok: true, address: await describeAddress(first, resolver) };
}

/**
 * `Promise.all` over a bounded number of workers.
 *
 * Results come back in input order whatever order they finish in, because the
 * order of a route is the route.
 */
async function mapWithConcurrency<In, Out>(
    items: readonly In[],
    limit: number,
    run: (item: In) => Promise<Out>,
): Promise<Out[]> {
    const results = new Array<Out>(items.length);
    let next = 0;

    async function worker(): Promise<void> {
        for (;;) {
            const index = next;
            next += 1;

            if (index >= items.length) {
                return;
            }

            results[index] = await run(items[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

    return results;
}

export type { Hop };
