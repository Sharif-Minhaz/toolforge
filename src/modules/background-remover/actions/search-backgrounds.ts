"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import { searchPexelsPhotos } from "../repository/pexels";
import {
    isPhotoSearchConfigured,
    spendPhotoSearchQuota,
    sweepPhotoSearchQuotaRows,
} from "../repository/photo-quota";
import type { PhotoSearchResult } from "../types";
import { photoSearchRequestSchema } from "../validation/photo-search";

/**
 * Searches Pexels for a background, for the Photo tab.
 *
 * The gates are ordered by cost, which is the same argument
 * `tools/actions/import-remote-image.ts` makes:
 *
 * 1. **Shape first** — free and local. A malformed request must not cost a
 *    database write or a packet.
 * 2. **Quota before the network**, because it is the only gate that bounds
 *    *volume*: everything above it refuses one bad request, and this is what
 *    refuses the thousandth good one. It fails closed.
 * 3. **The upstream call last.**
 *
 * The allowance is spent whether or not photographs come back. A search that
 * failed and cost nothing is a free retry loop, and retrying is exactly what a
 * script does.
 *
 * No Turnstile, for the same reason the picture importer has none: this reads a
 * public catalogue and hands back what anybody could have fetched from Pexels
 * themselves. A challenge would cost every reader a puzzle on every keystroke to
 * save one abuser a rate-limited minute — and unlike the tools that front a
 * model, there is no per-call money at stake here, only a shared allowance the
 * counter above already bounds.
 */
export async function searchBackgrounds(input: unknown): Promise<PhotoSearchResult> {
    const parsed = photoSearchRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_request" };
    }

    if (!isPhotoSearchConfigured()) {
        // Expected on a clone with no key rather than a fault, so this is not an
        // error-level event. The page already renders the tab disabled; this
        // catches a request that raced the configuration.
        logEvent("warn", "background_remover.search_not_configured");

        return { ok: false, reason: "not_configured" };
    }

    const remoteIp = resolveRemoteIp(await headers());

    // No address means no way to meter the caller, and an unmeterable caller is
    // exactly the one this limit exists for.
    if (remoteIp === undefined) {
        logEvent("error", "background_remover.no_remote_ip");

        return { ok: false, reason: "rate_limited" };
    }

    const spent = await spendPhotoSearchQuota(remoteIp);

    if (spent === null || !spent.verdict.allowed) {
        return { ok: false, reason: spent === null ? "not_configured" : "rate_limited" };
    }

    if (spent.windowOpened) {
        // Off the response path, and only when a fresh window opened — at most
        // once a window per active server, usually deleting nothing.
        after(() => sweepPhotoSearchQuotaRows());
    }

    return searchPexelsPhotos(parsed.data.query, parsed.data.topic, parsed.data.page);
}
