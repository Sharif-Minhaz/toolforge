import { z } from "zod";

import { BACKDROP_TOPICS } from "../domain/backdrop-topics";
import { MAX_PHOTO_PAGE, MAX_PHOTO_QUERY_LENGTH, PHOTO_FETCH_SIZE } from "../domain/constants";
import { BACKGROUND_TABS, CUTOUT_QUALITIES } from "../types";

/**
 * What the browser may ask the search action for.
 *
 * The page size is **not** a parameter. It is fixed at `PHOTO_FETCH_SIZE` on the
 * server, because a caller who can name it can ask for eighty photographs per
 * request and spend the deployment's shared Pexels allowance eighty times faster
 * than the picker does — the counter meters requests, and this is the field that
 * decides how much one request is worth.
 */
export const photoSearchRequestSchema = z.object({
    /**
     * What the reader typed. Empty falls back to `topic`, and the resolution
     * happens on the server — see `resolveSearchTerm`. Trimmed here so ` ` and
     * `` are one request rather than two.
     */
    query: z.string().trim().max(MAX_PHOTO_QUERY_LENGTH).default(""),
    /**
     * Which chip is active. Sent as a key rather than as its search terms, so
     * the vocabulary that biases results away from photographs of people stays
     * on the server and cannot be dropped by a caller that simply omits it.
     */
    topic: z.enum(BACKDROP_TOPICS).optional(),
    page: z.number().int().min(1).max(MAX_PHOTO_PAGE).default(1),
});

export type PhotoSearchRequest = z.infer<typeof photoSearchRequestSchema>;

/**
 * What Pexels sends back, narrowed to what is read.
 *
 * `.passthrough()` is deliberately absent and `.catchall` is not used: unknown
 * fields are dropped rather than carried, so nothing an upstream adds later can
 * arrive in a Server Action's response by accident.
 *
 * The photo entry is `.array()` at the top rather than validated one at a time,
 * which means one malformed entry fails the whole page. That is the right trade
 * for a fixed upstream — a Pexels response with a photograph missing its
 * `photographer` field is a change worth noticing, not one to route around, and
 * the licence obligation is on every picture shown rather than on most of them.
 */
/**
 * HTTPS and nothing else.
 *
 * `z.url()` alone is not enough here and the gap is a real one: it validates
 * with the URL parser, which happily accepts `javascript:alert(1)` — and every
 * one of the fields below ends up as an `href` on a credit link or a `src` on an
 * `<img>`. Pinning the scheme is what keeps a compromised or spoofed upstream
 * from writing an executable link into this page. Plain `http` is excluded too,
 * because a mixed-content image simply fails to load and a credit link that
 * downgrades the connection is not one worth rendering.
 */
const httpsUrl = z.url({ protocol: /^https$/ });

export const pexelsPhotoSchema = z.object({
    id: z.number(),
    alt: z.string().nullable().default(null),
    url: httpsUrl,
    photographer: z.string(),
    photographer_url: httpsUrl,
    src: z.object({
        medium: httpsUrl,
        large: httpsUrl,
        large2x: httpsUrl,
        original: httpsUrl,
    }),
});

export const pexelsSearchResponseSchema = z.object({
    // Bounded by what is *asked* for, not by what is kept: the people filter
    // thins each page after this, so the ceiling has to be the fetch size.
    photos: z.array(pexelsPhotoSchema).max(PHOTO_FETCH_SIZE),
    next_page: z.union([httpsUrl, z.literal("")]).nullish(),
});

export type PexelsSearchResponse = z.infer<typeof pexelsSearchResponseSchema>;

/**
 * The tool's own search params.
 *
 * `.catch(undefined)` per field, so a link somebody edited by hand opens the tool
 * on its defaults rather than on a 500 — `CLAUDE.md` rule 8. There is deliberately
 * no parameter for a picture: this tool's input is a file, and a URL cannot carry
 * one.
 */
export const backgroundRemoverSearchParamsSchema = z.object({
    quality: z.enum(CUTOUT_QUALITIES).optional().catch(undefined),
    tab: z.enum(BACKGROUND_TABS).optional().catch(undefined),
    /** Prefills the stock search, so a link can open on "office" backgrounds. */
    q: z.string().trim().max(MAX_PHOTO_QUERY_LENGTH).optional().catch(undefined),
});

export type BackgroundRemoverSearchParams = z.infer<typeof backgroundRemoverSearchParamsSchema>;
