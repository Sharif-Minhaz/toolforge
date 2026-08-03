import { DEFAULT_SCHEME } from "./constants";
import type { KeyValue } from "../types";

/**
 * The URL is carried through the tool as the *text* that was written, never as
 * a re-serialised `URL`. Round-tripping through the platform parser would
 * silently lowercase the host, drop a default port and punycode an IDN — all
 * correct, and all changes to a command the reader is about to run somewhere
 * else. `new URL()` is used to *check* the address, not to rewrite it.
 */

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

export function hasScheme(url: string): boolean {
    return SCHEME_PATTERN.test(url);
}

/** curl assumes HTTPS when a URL names no scheme, and so does this. */
export function ensureScheme(url: string): string {
    return hasScheme(url) ? url : `${DEFAULT_SCHEME}://${url}`;
}

export function isValidUrl(url: string): boolean {
    try {
        new URL(url);

        return true;
    } catch {
        return false;
    }
}

/** Splits at the first `?` and the first `#`, without touching the text. */
export function splitUrl(url: string): {
    readonly base: string;
    readonly search: string;
    readonly hash: string;
} {
    const hashAt = url.indexOf("#");
    const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : url.slice(hashAt);
    const queryAt = withoutHash.indexOf("?");

    return queryAt === -1
        ? { base: withoutHash, search: "", hash }
        : { base: withoutHash.slice(0, queryAt), search: withoutHash.slice(queryAt + 1), hash };
}

function decodeComponent(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
        // A stray `%` is not an error worth failing a whole request over; the
        // raw text is still the truest thing to show.
        return value;
    }
}

/** Decoded pairs, in the order they appear. Repeated keys are kept repeated. */
export function parseQueryPairs(search: string): readonly KeyValue[] {
    if (search.length === 0) {
        return [];
    }

    return search
        .split("&")
        .filter((chunk) => chunk.length > 0)
        .map((chunk) => {
            const equals = chunk.indexOf("=");

            return equals === -1
                ? { key: decodeComponent(chunk), value: "" }
                : {
                      key: decodeComponent(chunk.slice(0, equals)),
                      value: decodeComponent(chunk.slice(equals + 1)),
                  };
        });
}

export function queryOf(url: string): readonly KeyValue[] {
    return parseQueryPairs(splitUrl(url).search);
}

/**
 * Appends already-encoded text to the query string, which is what `-G` does:
 * curl folds the `-d` chunks in verbatim rather than re-encoding them.
 */
export function appendQuery(url: string, chunk: string): string {
    if (chunk.length === 0) {
        return url;
    }

    const { base, search, hash } = splitUrl(url);
    const joined = search.length === 0 ? chunk : `${search}&${chunk}`;

    return `${base}?${joined}${hash}`;
}

/** RFC 3986's unreserved set, matching what curl's own escaper leaves alone. */
export function percentEncode(value: string): string {
    return encodeURIComponent(value).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function formatUrlEncoded(fields: readonly KeyValue[]): string {
    return fields
        .map((field) => `${percentEncode(field.key)}=${percentEncode(field.value)}`)
        .join("&");
}

/**
 * Reads a body as form pairs, or returns null when it is not one. Deliberately
 * strict: a bare token with no `=` is far likelier to be a raw payload that
 * happens to hold no special character than a form field with no value.
 */
export function parseUrlEncodedBody(text: string): readonly KeyValue[] | null {
    if (text.length === 0 || /[\r\n]/.test(text)) {
        return null;
    }

    const chunks = text.split("&");

    if (chunks.some((chunk) => !chunk.includes("="))) {
        return null;
    }

    return chunks.map((chunk) => {
        const equals = chunk.indexOf("=");

        return {
            key: decodeComponent(chunk.slice(0, equals)),
            value: decodeComponent(chunk.slice(equals + 1)),
        };
    });
}
