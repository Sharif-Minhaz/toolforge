export type HttpEndpointOptions = {
    /**
     * Route the worker actually serves, appended when the configured value names
     * no path of its own. Left unset for a worker that answers on `/`.
     */
    readonly defaultPath?: string;
};

/**
 * Turns a configured worker URL into one that can be fetched.
 *
 * A variable set to the bare origin of a worker that only answers on a sub-route
 * would fail in a way that reads like a bad request, so a value with no path of
 * its own gets `defaultPath` appended; anything that already names a path is
 * left exactly as written.
 *
 * Returns `null` for a value that is not an HTTP(S) URL at all, so a typo — or a
 * `javascript:` string — surfaces as "not configured" rather than as an
 * unexplained network error.
 */
export function resolveHttpEndpoint(
    configured: string,
    options: HttpEndpointOptions = {},
): string | null {
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

    if (url.pathname === "/" && options.defaultPath) {
        url.pathname = `/${options.defaultPath}`;
    }

    return url.toString();
}
