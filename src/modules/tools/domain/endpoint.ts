/**
 * Turns a configured worker URL into one that can be fetched.
 *
 * Returns `null` for a value that is not an HTTP(S) URL at all, so a typo — or a
 * `javascript:` string — surfaces as "not configured" rather than as an
 * unexplained network error.
 */
export function resolveHttpEndpoint(configured: string): string | null {
    const trimmed = configured.trim();

    if (trimmed.length === 0) {
        return null;
    }

    let url: URL;

    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return null;
    }

    return url.toString();
}
