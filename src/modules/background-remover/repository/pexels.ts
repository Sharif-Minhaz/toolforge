import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { SITE_NAME, SITE_URL } from "@/modules/seo/domain/site";

import { resolveSearchTerm, type BackdropTopic } from "../domain/backdrop-topics";
import {
    MAX_UPSTREAM_ERROR_LENGTH,
    PEXELS_API_ORIGIN,
    PHOTO_FETCH_SIZE,
    PHOTO_PAGE_SIZE,
    PHOTO_SEARCH_TIMEOUT_MS,
} from "../domain/constants";
import { hasNextPage, hidesPeople, toStockPhotos } from "../domain/pexels";
import type { PhotoSearchResult } from "../types";
import { pexelsSearchResponseSchema } from "../validation/photo-search";

/**
 * The one request this tool makes on the reader's behalf.
 *
 * It is the *easy* half of the two problems in
 * `docs/patterns/outbound-requests.md`: the destination is a constant in this
 * file, not a host somebody typed, so there is no SSRF surface, no address guard
 * and no redirect chain to walk. Plain `fetch` is correct here in a way it is not
 * in `tools/repository/remote-image.ts`, and the reason is worth stating so the
 * next person does not copy the wrong one of the two.
 *
 * What is left is the part that is easy to get wrong anyway:
 *
 * - **The key never leaves this process.** It is read from the environment here,
 *   on the server, and the browser calls a Server Action rather than Pexels. A
 *   `NEXT_PUBLIC_` name for it would put a shared, rate-limited credential into
 *   every page's JavaScript.
 * - **The reader's query is the only thing sent.** No referrer, no address, no
 *   cookie. Pexels learns that this deployment searched for "office", not who
 *   did.
 * - **The response is validated before it is trusted**, because it crosses a
 *   Server Action boundary next and ends up as `src` on an `<img>` and an `href`
 *   on a credit link. An unvalidated `photographer_url` is a stored link nobody
 *   here wrote.
 * - **The request is capped in time.** The reader is typing; a search that takes
 *   eight seconds to fail has already been replaced by the next keystroke, and
 *   holding the socket open only occupies a slot the next search needs.
 */

/**
 * Always `/v1/search`, never `/v1/curated`.
 *
 * The curated feed is whatever Pexels' editors are featuring, and that is
 * portraits more often than not — a photograph of somebody else being the one
 * thing that is never a useful background for a photograph of you. Since
 * `resolveSearchTerm` never returns an empty string, there is always a term to
 * search for and the curated endpoint is never the right answer.
 */
function buildRequestUrl(term: string, page: number): URL {
    const url = new URL("/v1/search", PEXELS_API_ORIGIN);

    url.searchParams.set("query", term);
    // Landscape only. Every background here goes behind a portrait through a
    // cover fit, and a tall photograph loses its sides to that crop — so the
    // grid would be showing the reader something other than what they get.
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", String(PHOTO_FETCH_SIZE));
    url.searchParams.set("page", String(page));

    return url;
}

export async function searchPexelsPhotos(
    query: string,
    topic: BackdropTopic | undefined,
    page: number,
): Promise<PhotoSearchResult> {
    const key = (process.env.PEXELS_API_KEY ?? "").trim();

    if (key.length === 0) {
        return { ok: false, reason: "not_configured" };
    }

    const url = buildRequestUrl(resolveSearchTerm(query, topic), page);

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: key,
                Accept: "application/json",
                // Names this site rather than hiding behind a browser string, so
                // an operator reading their logs can tell who is calling.
                "User-Agent": `${SITE_NAME} (${SITE_URL})`,
            },
            // Nothing here is worth a cached answer that outlives the key's
            // rate-limit window, and Next would otherwise cache this indefinitely.
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(PHOTO_SEARCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            const body = (await response.text().catch(() => "")).slice(
                0,
                MAX_UPSTREAM_ERROR_LENGTH,
            );

            logEvent("warn", "background_remover.pexels_rejected", {
                status: response.status,
                body,
            });

            // Pexels' own throttle is reported as this deployment being over its
            // allowance, which is exactly what it is — never as the visitor being
            // over theirs. See `docs/case-studies/watermark-remover.md` for the
            // same trap in the other direction.
            return {
                ok: false,
                reason: response.status === 429 ? "rate_limited" : "upstream_unavailable",
            };
        }

        const parsed = pexelsSearchResponseSchema.safeParse(await response.json());

        if (!parsed.success) {
            logEvent("error", "background_remover.pexels_unreadable", {
                issue: parsed.error.issues[0]?.path.join(".") ?? "unknown",
            });

            return { ok: false, reason: "unreadable_response" };
        }

        // Filtered here rather than in the browser, so the tiles the reader is
        // offered and the tiles this deployment paid for are the same set — and
        // so a caller that skips the picker cannot opt out of it.
        const kept = parsed.data.photos.filter(hidesPeople).slice(0, PHOTO_PAGE_SIZE);

        return {
            ok: true,
            photos: toStockPhotos(kept),
            // Read from Pexels' own link, so "load more" still works when this
            // page came back thin. A page that filtered down to three tiles is
            // not the end of the results, and treating it as one would strand
            // the reader on a nearly empty grid.
            hasMore: hasNextPage(parsed.data.next_page),
        };
    } catch (caught) {
        logEvent("error", "background_remover.pexels_threw", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
