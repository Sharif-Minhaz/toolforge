import type { HttpHeader, KeyValue } from "../types";

/**
 * Header names are case-insensitive on the wire, so every lookup here is too —
 * but the name is stored exactly as it was written. A request that said
 * `X-Request-Id` should come back out saying `X-Request-Id`, not `x-request-id`.
 */

export function findHeader(headers: readonly HttpHeader[], name: string): HttpHeader | undefined {
    const wanted = name.toLowerCase();

    return headers.find((header) => header.name.toLowerCase() === wanted);
}

export function headerValue(headers: readonly HttpHeader[], name: string): string | null {
    return findHeader(headers, name)?.value ?? null;
}

export function hasHeader(headers: readonly HttpHeader[], name: string): boolean {
    return findHeader(headers, name) !== undefined;
}

export function removeHeader(headers: readonly HttpHeader[], name: string): readonly HttpHeader[] {
    const unwanted = name.toLowerCase();

    return headers.filter((header) => header.name.toLowerCase() !== unwanted);
}

/** Replaces in place when the name is already present, so order is kept. */
export function setHeader(
    headers: readonly HttpHeader[],
    name: string,
    value: string,
): readonly HttpHeader[] {
    const wanted = name.toLowerCase();
    let replaced = false;

    const next = headers.map((header) => {
        if (header.name.toLowerCase() !== wanted) {
            return header;
        }

        replaced = true;

        return { name: header.name, value };
    });

    return replaced ? next : [...next, { name, value }];
}

/** Adds the header only when the request does not already carry one. */
export function defaultHeader(
    headers: readonly HttpHeader[],
    name: string,
    value: string,
): readonly HttpHeader[] {
    return hasHeader(headers, name) ? headers : [...headers, { name, value }];
}

/**
 * Reads one `-H` argument. curl gives three shapes meaning three things:
 * `Name: value` sends it, `Name;` sends it empty, and `Name:` with nothing
 * after removes a header curl would otherwise add itself.
 */
export function parseHeaderArgument(
    argument: string,
): { readonly header: HttpHeader } | { readonly removes: string } | null {
    const trimmed = argument.trim();

    if (trimmed.length === 0) {
        return null;
    }

    const colon = trimmed.indexOf(":");

    if (colon === -1) {
        return trimmed.endsWith(";")
            ? { header: { name: trimmed.slice(0, -1).trim(), value: "" } }
            : null;
    }

    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();

    if (name.length === 0) {
        return null;
    }

    return value.length === 0 ? { removes: name } : { header: { name, value } };
}

/* ------------------------------------------------------------- cookies --- */

/** `session=abc; theme=dark` → two pairs. A cookie value may hold `=`. */
export function parseCookiePairs(value: string): readonly KeyValue[] {
    return value
        .split(";")
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        .map((chunk) => {
            const equals = chunk.indexOf("=");

            return equals === -1
                ? { key: chunk, value: "" }
                : { key: chunk.slice(0, equals), value: chunk.slice(equals + 1) };
        });
}

export function formatCookieHeader(cookies: readonly KeyValue[]): string {
    return cookies.map((cookie) => `${cookie.key}=${cookie.value}`).join("; ");
}

/**
 * `-b` takes either a pair list or the path of a cookie jar, and curl tells
 * them apart by looking for an `=`. A path is a file this tool cannot read, so
 * the two have to stay separable rather than both becoming a header.
 */
export function isCookieFile(argument: string): boolean {
    return !argument.includes("=");
}

/**
 * Moves a `Cookie` header into the cookie list.
 *
 * Both parsers run this, and that is the point: a command that wrote its
 * cookies as `-b` and a snippet that wrote them as a header describe the same
 * request, so the Request tab has to show them the same way. Emitting merges
 * them back into one header, so nothing is lost by holding them apart here.
 */
export function splitCookies(headers: readonly HttpHeader[]): {
    readonly headers: readonly HttpHeader[];
    readonly cookies: readonly KeyValue[];
} {
    const cookieHeaders = headers.filter((header) => header.name.toLowerCase() === "cookie");

    if (cookieHeaders.length === 0) {
        return { headers, cookies: [] };
    }

    return {
        headers: removeHeader(headers, "cookie"),
        cookies: cookieHeaders.flatMap((header) => parseCookiePairs(header.value)),
    };
}
