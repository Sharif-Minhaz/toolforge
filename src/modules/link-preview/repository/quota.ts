import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    QUOTA_LIMIT_PER_ADDRESS,
    QUOTA_LIMIT_PER_HOST,
    QUOTA_WINDOW_MS,
} from "../domain/constants";

/**
 * The counter that keeps "show me this page's preview" from being a free,
 * anonymous, scriptable HTTP client running from this server's address.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and it
 * returns `null` — which the orchestrator treats as a refusal, exactly like the
 * image importer's and the Port Scanner's. The failure mode of an open limiter
 * here is an unmetered fetcher with this site's name in the user agent, and
 * that is worth more to an abuser than any preview is to a reader.
 *
 * The paste mode is unaffected: it reads markup in the tab and never reaches
 * this, so a deployment with the salt blank still has half a tool.
 *
 * Two counters, both needed. The address counter stops one visitor scripting
 * the fetcher; the host counter stops every visitor together pointing it at one
 * site. The host is the *page's*; a picture on a CDN is fetched under the
 * page's allowance, at most two per check, which bounds it as tightly.
 */

export type PreviewQuotaBucket = "address" | "host";

export function isPreviewQuotaConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.LINK_PREVIEW_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendPreviewQuota(
    address: string,
    host: string,
    now = new Date(),
): Promise<RateLimitOutcome<PreviewQuotaBucket> | null> {
    if (!isPreviewQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<PreviewQuotaBucket>({
        salt: process.env.LINK_PREVIEW_IP_SALT ?? "",
        // Its own namespace, so a check can never land on a row the image
        // importer or a studio is using in the shared `service_quota` table.
        namespace: "link:preview",
        counters: [
            { bucket: "address", value: address, limit: QUOTA_LIMIT_PER_ADDRESS },
            // Lower-cased so `Example.com` and `example.com` are one host.
            { bucket: "host", value: host.toLowerCase(), limit: QUOTA_LIMIT_PER_HOST },
        ],
        fallback: { bucket: "address", limit: QUOTA_LIMIT_PER_ADDRESS },
        windowMs: QUOTA_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepPreviewQuotaRows };
