import "server-only";

/**
 * Whether this deployment can run the studio at all.
 *
 * Kept apart from `servers.ts` so a page can ask the question without pulling
 * the Prisma client into its import graph — the same split the URL Shortener and
 * the Mock Server Studio use.
 *
 * Read from the environment on every call rather than cached, so the answer is
 * never stale across a restart that changed it.
 */
export function isJsonStorageConfigured(): boolean {
    return (process.env.DATABASE_URL ?? "").trim().length > 0;
}

/**
 * Whether the limiters can run.
 *
 * Separate from storage because they fail in opposite directions. Without a
 * database the studio has nothing to show and says so. Without a salt it could
 * still write rows — and must not, because an unmetered endpoint that mints
 * publicly callable addresses **which then store whatever is posted to them** is
 * free hosting for a stranger's data under this site's name. See
 * `spendCreateQuota` and `spendServeQuota`.
 */
export function isJsonQuotaConfigured(): boolean {
    return isJsonStorageConfigured() && (process.env.JSON_SERVER_IP_SALT ?? "").trim().length > 0;
}
