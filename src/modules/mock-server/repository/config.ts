import "server-only";

/**
 * Whether this deployment can run the studio at all.
 *
 * Kept apart from `workspaces.ts` so a page can ask the question without
 * pulling the Prisma client into its import graph — the same split the URL
 * Shortener uses.
 *
 * Read from the environment on every call rather than cached, so the answer is
 * never stale across a restart that changed it.
 */
export function isMockStorageConfigured(): boolean {
    return (process.env.DATABASE_URL ?? "").trim().length > 0;
}

/**
 * Whether the creation limiter can run.
 *
 * Separate from storage because they fail in opposite directions. Without a
 * database the studio has nothing to show and says so. Without a salt it could
 * still write rows — and must not, because an unmetered endpoint that mints
 * publicly callable addresses is precisely what nobody should host. See
 * `spendCreateQuota`.
 */
export function isMockQuotaConfigured(): boolean {
    return isMockStorageConfigured() && (process.env.MOCK_IP_SALT ?? "").trim().length > 0;
}
