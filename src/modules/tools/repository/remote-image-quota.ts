import "server-only";

import {
    REMOTE_IMAGE_LIMIT_PER_ADDRESS,
    REMOTE_IMAGE_LIMIT_PER_HOST,
    REMOTE_IMAGE_WINDOW_MS,
    type RemoteImageBucket,
} from "../domain/remote-image";
import { spendRateCounters, sweepRateCounterRows, type RateLimitOutcome } from "./rate-counter";

/**
 * The counter that keeps "paste a picture's address" from being a free,
 * anonymous, scriptable HTTP client running from this server's address.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and it
 * returns `null` — which the action treats as a refusal, exactly like the Port
 * Scanner's. Every other gate on this site degrades toward working; this one
 * degrades toward not working, because the failure mode of an open limiter here
 * is an unmetered proxy with this site's reputation attached, and a proxy is
 * what an abuser wants far more than a picture is.
 *
 * The tools themselves are unaffected: with the salt blank the URL field
 * renders disabled and says so, and every other way of getting a picture in —
 * picking, dropping, pasting — never leaves the tab and never touches this.
 */

export function isRemoteImageImportConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.IMAGE_IMPORT_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendRemoteImageQuota(
    address: string,
    host: string,
    now = new Date(),
): Promise<RateLimitOutcome<RemoteImageBucket> | null> {
    if (!isRemoteImageImportConfigured()) {
        return null;
    }

    return spendRateCounters<RemoteImageBucket>({
        salt: process.env.IMAGE_IMPORT_IP_SALT ?? "",
        // Its own namespace, so nothing here can land on a row one of the three
        // studios is using even though all four share the `service_quota` table.
        namespace: "image:import",
        counters: [
            { bucket: "address", value: address, limit: REMOTE_IMAGE_LIMIT_PER_ADDRESS },
            // Lower-cased so `Example.com` and `example.com` are one host rather
            // than two allowances.
            { bucket: "host", value: host.toLowerCase(), limit: REMOTE_IMAGE_LIMIT_PER_HOST },
        ],
        fallback: { bucket: "address", limit: REMOTE_IMAGE_LIMIT_PER_ADDRESS },
        windowMs: REMOTE_IMAGE_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepRemoteImageQuotaRows };
