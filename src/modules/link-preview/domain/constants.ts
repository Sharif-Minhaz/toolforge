import { DECODABLE_IMAGE_TYPES } from "@/modules/tools/types";

/**
 * Every limit the Link Preview debugger enforces, in one place.
 */

/** A short identity field: capped, not metered. Matches the image importer's ceiling. */
export const MAX_URL_LENGTH = 2_048;

/**
 * A content box, so never capped with `maxLength` — metered, refused under the
 * box, and the analysis simply does not run past it. A head is a few kilobytes;
 * a whole saved page with inline CSS is a few hundred; this is room for both.
 */
export const MAX_PASTED_HTML_LENGTH = 1_000_000;

/**
 * How much of a page is read before the fetch gives up on finding `</head>`.
 *
 * Facebook's documented limit, and the largest any platform documents: a head
 * that ends past this is past every crawler's, so reading further would only
 * spend this server's bandwidth on a stranger's behalf. The read also stops
 * early, the moment `</head>` arrives, so a normal page costs a few kilobytes.
 */
export const MAX_PAGE_BYTES = 1024 * 1024;

/**
 * The largest picture fetched to measure. Facebook's 8 MB is the most
 * generous published ceiling; a picture over it is over every platform's, and
 * the size the server reported before refusing is all the finding needs.
 */
export const MAX_PREVIEW_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * At most two pictures per check: the `og:image` and, when it names a
 * different file, the `twitter:image`. Those are the only two any card picks.
 */
export const MAX_PROBED_IMAGES = 2;

/**
 * The largest favicon fetched. A multi-size `favicon.ico` runs to a few
 * hundred kilobytes at most; anything past this is not a favicon a search
 * result would draw at 28 px, and it would travel back to the reader as base64.
 */
export const MAX_FAVICON_BYTES = 512 * 1024;

/**
 * What a favicon may be declared as. The pictures any card measures, plus the
 * two formats favicons mostly are: ICO under both its registered and its
 * customary name, and SVG. All of them are drawn by the reader's browser from
 * a data URL inside an `<img>`, where an SVG's scripts never run.
 */
export const FAVICON_TYPES = [
    ...DECODABLE_IMAGE_TYPES,
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/svg+xml",
] as const;

/** Followed by hand and re-guarded each time. Covers `http → https → www → canonical`. */
export const MAX_PAGE_REDIRECTS = 4;

export const PAGE_CONNECT_TIMEOUT_MS = 6_000;

export const PAGE_TOTAL_TIMEOUT_MS = 12_000;

/** Per calling address, per window. Fixing tags is a loop of re-checks; this allows a long one. */
export const QUOTA_LIMIT_PER_ADDRESS = 30;

/**
 * Per target host, per window, across every visitor. Protects whoever is on the
 * other end: a link to this tool posted somewhere busy must not become a
 * crawl of one site from this server's address.
 */
export const QUOTA_LIMIT_PER_HOST = 60;

export const QUOTA_WINDOW_MS = 10 * 60 * 1_000;
