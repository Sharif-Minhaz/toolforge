import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    GRAPHQL_RATE_LIMIT_PER_ADDRESS,
    GRAPHQL_RATE_LIMIT_PER_SERVER,
    type RateBucket,
} from "../domain/rate-limit";
import { isGraphqlQuotaConfigured } from "./config";

/**
 * This studio's binding of the shared counter in
 * `tools/repository/rate-counter.ts`.
 *
 * Two counters per request — the calling address and the server key — under the
 * `graphql:serve` namespace, so nothing here can land on a row either other
 * studio is using even though all three share the `service_quota` table.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and an
 * unmetered public execution path that also *stores what is mutated into it* is
 * free hosting for a stranger's data with this site's name on it. In practice
 * the two failures coincide: the same database is what the serving path needs to
 * find a document at all.
 */
export async function spendServeQuota(
    address: string,
    serverKey: string,
    now = new Date(),
): Promise<RateLimitOutcome<RateBucket> | null> {
    if (!isGraphqlQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<RateBucket>({
        salt: process.env.GRAPHQL_SERVER_IP_SALT ?? "",
        namespace: "graphql:serve",
        counters: [
            { bucket: "address", value: address, limit: GRAPHQL_RATE_LIMIT_PER_ADDRESS },
            { bucket: "server", value: serverKey, limit: GRAPHQL_RATE_LIMIT_PER_SERVER },
        ],
        fallback: { bucket: "address", limit: GRAPHQL_RATE_LIMIT_PER_ADDRESS },
        now,
    });
}

export { sweepRateCounterRows as sweepQuotaRows };
