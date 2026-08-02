import type { UrlParseResult, UrlParts, UrlQueryParam } from "../types";
import { MAX_URL_INPUT_LENGTH } from "./constants";

/** `scheme:` per RFC 3986 — a letter, then letters, digits, `+`, `-` or `.`. */
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

function toUrl(candidate: string): URL | null {
    try {
        return new URL(candidate);
    } catch {
        return null;
    }
}

function readParts(url: URL): UrlParts {
    return {
        protocol: url.protocol,
        username: url.username,
        password: url.password,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        query: url.search,
        fragment: url.hash,
        // A non-special scheme — `mailto:`, `urn:` — has no origin, and the
        // platform says so with the *string* "null". An empty part reads as
        // "this URL has none", which is what it means.
        origin: url.origin === "null" ? "" : url.origin,
    };
}

function readParams(url: URL): readonly UrlQueryParam[] {
    return [...url.searchParams].map(([key, value]) => ({ key, value }));
}

/**
 * The one parse the whole tool runs, shared by the server-rendered first paint
 * and every keystroke afterwards.
 *
 * Delegates to the platform's WHATWG parser rather than a regex of its own, so
 * what the tool reports is what a browser, `fetch`, and every server on the far
 * end will read. That parser also normalises — lowercased scheme and host,
 * punycoded IDN, default port dropped — which `normalized` flags rather than
 * hides.
 */
export function parseUrl(input: string): UrlParseResult {
    const text = input.trim();

    if (text.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (text.length > MAX_URL_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const url = toUrl(text);

    if (url) {
        return {
            ok: true,
            href: url.href,
            parts: readParts(url),
            params: readParams(url),
            normalized: url.href !== text,
        };
    }

    // A leading slash is a path relative to some other origin. Prefixing a
    // scheme would parse — `https:///docs` yields the host `docs` — so the
    // guess below has to be kept away from it.
    if (text.startsWith("/")) {
        return { ok: false, reason: "relative_path" };
    }

    if (SCHEME_PATTERN.test(text)) {
        return { ok: false, reason: "invalid_url" };
    }

    const guessed = toUrl(`https://${text}`);

    return guessed
        ? { ok: false, reason: "missing_scheme", suggestion: guessed.href }
        : { ok: false, reason: "invalid_url" };
}
