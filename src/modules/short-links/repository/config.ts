import "server-only";

/**
 * Whether this deployment can store short links at all.
 *
 * Kept apart from `links.ts` so a page can ask the question without pulling the
 * Prisma client into its import graph. A deployment with no database still
 * renders the whole QR tool; it just renders one checkbox disabled. The URL
 * Shortener has nothing to do without one, and says so.
 *
 * Read from the environment on every call rather than cached, so the answer is
 * never stale across a restart that changed it.
 */
export function isShortLinkStorageConfigured(): boolean {
    return (process.env.DATABASE_URL ?? "").trim().length > 0;
}
