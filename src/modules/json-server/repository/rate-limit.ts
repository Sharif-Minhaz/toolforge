import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    JSON_RATE_LIMIT_PER_ADDRESS,
    JSON_RATE_LIMIT_PER_SERVER,
    type RateBucket,
} from "../domain/rate-limit";
import { isJsonQuotaConfigured } from "./config";

/**
 * This studio's binding of the shared counter in
 * `tools/repository/rate-counter.ts`.
 *
 * Two counters per request — the calling address and the server key — under the
 * `json:serve` namespace, so nothing here can ever land on a row the Mock Server
 * Studio is using even though both share the `service_quota` table.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and an
 * unmetered public execution path that also *stores what is posted to it* is
 * free hosting for a stranger's data with this site's name on it. In practice
 * the two failures coincide: the same database is what `serveJsonRequest` needs
 * to find a document at all.
 */
export async function spendServeQuota(
    address: string,
    serverKey: string,
    now = new Date(),
): Promise<RateLimitOutcome<RateBucket> | null> {
    if (!isJsonQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<RateBucket>({
        salt: process.env.JSON_SERVER_IP_SALT ?? "",
        namespace: "json:serve",
        counters: [
            { bucket: "address", value: address, limit: JSON_RATE_LIMIT_PER_ADDRESS },
            { bucket: "server", value: serverKey, limit: JSON_RATE_LIMIT_PER_SERVER },
        ],
        fallback: { bucket: "address", limit: JSON_RATE_LIMIT_PER_ADDRESS },
        now,
    });
}

export { sweepRateCounterRows as sweepQuotaRows };
