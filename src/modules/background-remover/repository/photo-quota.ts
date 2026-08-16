import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    PHOTO_SEARCH_LIMIT_PER_ADDRESS,
    PHOTO_SEARCH_LIMIT_PER_SERVER,
    PHOTO_SEARCH_WINDOW_MS,
} from "../domain/constants";
import type { PhotoSearchBucket } from "../types";

/**
 * The counter on stock-background search.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and it
 * returns `null` — which the action treats as a refusal. That is the same
 * direction the picture-by-address importer takes, and for a related but distinct
 * reason worth being exact about:
 *
 * Pexels meters **the API key**, not the caller. Every visitor's search is
 * charged against one allowance belonging to this deployment, so an unmetered
 * search box is not merely a free HTTP client — it is a scriptable way to
 * exhaust a shared credential and take the picker away from everybody else until
 * the hour turns over. A limiter that degrades toward "allow" would hand that
 * away on the first day the database is unreachable.
 *
 * Nothing else about the tool depends on it. Cutting a background out, blurring
 * one, painting a colour behind one, and dropping in a background of your own all
 * happen in the tab and never reach this file — with the salt blank, the Photo
 * tab's search row renders disabled and says why, and the other two tabs are
 * untouched.
 */

/**
 * The second counter's value is a constant rather than a hostname.
 *
 * The picture-by-address importer keys its second counter on the *target host*,
 * because the thing it is protecting is whoever is on the other end. Here the
 * destination is always `api.pexels.com`, and what is being protected is this
 * deployment's own key — so the counter is deployment-wide by construction. A
 * literal makes that impossible to misread as "per host" later.
 */
const SERVER_BUCKET_VALUE = "pexels";

export function isPhotoSearchConfigured(): boolean {
    return (
        (process.env.PEXELS_API_KEY ?? "").trim().length > 0 &&
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.IMAGE_IMPORT_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendPhotoSearchQuota(
    address: string,
    now = new Date(),
): Promise<RateLimitOutcome<PhotoSearchBucket> | null> {
    if (!isPhotoSearchConfigured()) {
        return null;
    }

    return spendRateCounters<PhotoSearchBucket>({
        salt: process.env.IMAGE_IMPORT_IP_SALT ?? "",
        // Its own namespace under the salt the image tools already share, so a
        // search can never land on a row the picture-by-address importer is
        // using even though both hash with the same secret.
        namespace: "image:stock",
        counters: [
            { bucket: "address", value: address, limit: PHOTO_SEARCH_LIMIT_PER_ADDRESS },
            { bucket: "server", value: SERVER_BUCKET_VALUE, limit: PHOTO_SEARCH_LIMIT_PER_SERVER },
        ],
        fallback: { bucket: "address", limit: PHOTO_SEARCH_LIMIT_PER_ADDRESS },
        windowMs: PHOTO_SEARCH_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepPhotoSearchQuotaRows };
