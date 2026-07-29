import { DETECT_PATH } from "./constants";

/**
 * The worker answers on `/detect` and 404s everywhere else, so a variable set
 * to the bare worker origin would fail in a way that reads like a bad request.
 * A configured value with no path of its own gets `/detect` appended; anything
 * that already names a path is left exactly as written.
 *
 * Returns `null` for a value that is not a URL at all, so a typo surfaces as
 * "not configured" rather than as an unexplained network error.
 */
export function resolveDetectEndpoint(configured: string): string | null {
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

    if (url.pathname === "/") {
        url.pathname = `/${DETECT_PATH}`;
    }

    return url.toString();
}
