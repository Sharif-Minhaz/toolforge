import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    MOCK_RATE_LIMIT_PER_ADDRESS,
    MOCK_RATE_LIMIT_PER_SERVER,
    type RateBucket,
} from "../domain/rate-limit";
import { isMockQuotaConfigured } from "./config";

/**
 * The studio's binding of the shared counter in
 * `tools/repository/rate-counter.ts`.
 *
 * Two counters per request — the calling address and the server key — under the
 * `mock:serve` namespace, so nothing here can ever land on a row the JSON Server
 * Studio is using.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and an
 * unmetered public execution path is a free, scriptable way to spend this
 * deployment's function budget. In practice the two failures coincide: the same
 * database is what `serveMockRequest` needs to find an endpoint at all, so a
 * deployment that cannot run this statement had nothing to serve anyway.
 */
export async function spendServeQuota(
    address: string,
    serverKey: string,
    now = new Date(),
): Promise<RateLimitOutcome<RateBucket> | null> {
    if (!isMockQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<RateBucket>({
        salt: process.env.MOCK_IP_SALT ?? "",
        namespace: "mock:serve",
        counters: [
            { bucket: "address", value: address, limit: MOCK_RATE_LIMIT_PER_ADDRESS },
            { bucket: "server", value: serverKey, limit: MOCK_RATE_LIMIT_PER_SERVER },
        ],
        fallback: { bucket: "address", limit: MOCK_RATE_LIMIT_PER_ADDRESS },
        now,
    });
}

export { sweepRateCounterRows as sweepQuotaRows };
