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
import type { LookupQuotaBucket } from "../types";

/**
 * The counter that keeps this tool inside somebody else's free tier.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and it
 * returns `null` — which the action treats as a refusal. Every other
 * degradation on this site falls toward doing the work; this one falls the
 * other way, and the reason is the second counter.
 *
 * crt.name meters **by address**, and the address it sees is this
 * deployment's. Every visitor's lookup is charged against one allowance of a
 * thousand a day belonging to the whole site — so an unmetered box here is not
 * merely a free HTTP client, it is a scriptable way to spend a shared budget and
 * take the tool away from everybody else until midnight, with a fair chance of
 * this server's address being blocked on the way. The deployment counter is what
 * bounds that, and a limiter that degrades toward "allow" would hand it away on
 * the first day the database is unreachable. See
 * `docs/patterns/outbound-requests.md`.
 *
 * Both counters, not just the second. The deployment ceiling alone would let one
 * caller drain the hour for everybody; the per-visitor ceiling alone would let
 * forty callers drain the day.
 */

/**
 * The second counter's value is a constant rather than the apex.
 *
 * The picture-by-address importer keys its second counter on the *target host*
 * because what it is protecting is whoever is on the other end. Here the
 * destination is always crt.name and what is being protected is this
 * deployment's share of one free allowance — so the counter is site-wide by
 * construction. A literal makes that impossible to misread as "per domain"
 * later.
 */
const SERVICE_BUCKET_VALUE = "crt.name";

export function isLookupQuotaConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.SUBDOMAIN_LOOKUP_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendLookupQuota(
    address: string,
    now = new Date(),
): Promise<RateLimitOutcome<LookupQuotaBucket> | null> {
    if (!isLookupQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<LookupQuotaBucket>({
        salt: process.env.SUBDOMAIN_LOOKUP_IP_SALT ?? "",
        // Its own namespace, so a lookup can never land on a row one of the
        // studios or the image importer is using even though every limit on
        // this site shares the `service_quota` table.
        namespace: "subdomain:lookup",
        counters: [
            { bucket: "address", value: address, limit: QUOTA_LIMIT_PER_ADDRESS },
            { bucket: "service", value: SERVICE_BUCKET_VALUE, limit: QUOTA_LIMIT_PER_DEPLOYMENT },
        ],
        fallback: { bucket: "address", limit: QUOTA_LIMIT_PER_ADDRESS },
        windowMs: QUOTA_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepLookupQuotaRows };
