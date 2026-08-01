import "server-only";

/**
 * Whether this deployment can store dynamic codes at all.
 *
 * Kept apart from `qr-links.ts` so the page can ask the question without pulling
 * the Prisma client into its import graph. A deployment with no database still
 * renders the whole QR tool; it just renders one checkbox disabled.
 *
 * Read from the environment on every call rather than cached, so the answer is
 * never stale across a restart that changed it.
 */
export function isDynamicQrConfigured(): boolean {
    return (process.env.DATABASE_URL ?? "").trim().length > 0;
}
