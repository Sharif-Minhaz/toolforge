import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    QUOTA_LIMIT_PER_ADDRESS,
    QUOTA_LIMIT_PER_DEPLOYMENT,
    QUOTA_WINDOW_MS,
} from "../domain/constants";
import type { RouteQuotaBucket } from "../types";

/**
 * The counter that keeps this tool inside somebody else's free tier.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and it
 * returns `null` — which the action treats as a refusal. Every other
 * degradation on this site falls toward doing the work; this one falls the
 * other way, and the reason is the second counter.
 *
 * One route is up to forty hops, and every located hop costs a reverse lookup,
 * two Team Cymru queries and an RDAP request. None of those services is ours,
 * all of them meter by address, and the address they see is this deployment's.
 * An unmetered box here is a scriptable way to spend a shared allowance and take
 * the tool away from everybody else — with a fair chance of this server's
 * address being blocked on the way. See `docs/patterns/outbound-requests.md`.
 *
 * Both counters, not just the second. The deployment ceiling alone would let one
 * caller drain the hour for everybody; the per-visitor ceiling alone would let
 * five callers drain it between them.
 */

/**
 * The second counter's value is a constant rather than the host being mapped.
 *
 * What is being protected is this deployment's share of three free allowances,
 * which is site-wide by construction — the registries are the same three
 * whichever address is asked about. A literal makes that impossible to misread
 * as "per target" later.
 */
const SERVICE_BUCKET_VALUE = "registry-lookups";

export function isRouteQuotaConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.IP_GLOBE_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendRouteQuota(
    address: string,
    now = new Date(),
): Promise<RateLimitOutcome<RouteQuotaBucket> | null> {
    if (!isRouteQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<RouteQuotaBucket>({
        salt: process.env.IP_GLOBE_IP_SALT ?? "",
        // Its own namespace, so a route can never land on a row one of the
        // studios or another lookup is using even though every limit on this
        // site shares the `service_quota` table.
        namespace: "ip-globe:route",
        counters: [
            { bucket: "address", value: address, limit: QUOTA_LIMIT_PER_ADDRESS },
            { bucket: "service", value: SERVICE_BUCKET_VALUE, limit: QUOTA_LIMIT_PER_DEPLOYMENT },
        ],
        fallback: { bucket: "address", limit: QUOTA_LIMIT_PER_ADDRESS },
        windowMs: QUOTA_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepRouteQuotaRows };
