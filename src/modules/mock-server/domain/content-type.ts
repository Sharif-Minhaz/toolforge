/**
 * What a mock endpoint is allowed to claim it is returning.
 *
 * This is not a formatting preference. While the studio is path-hosted on the
 * main origin — see `docs/mock-server-studio.md` §4.1 — a mock response shares
 * an origin with the rest of ToolForge, so an endpoint able to answer
 * `text/html` is an endpoint able to serve a convincing sign-in page under this
 * site's name. The allowlist is the only thing preventing that, and it is
 * therefore default-deny with no per-server opt-in until execution moves to its
 * own subdomain.
 *
 * Scripts are refused for the same reason plus one more: a JavaScript response
 * on this origin can be `<script src>`-ed by any page and would run with this
 * origin's privileges.
 */

export const ALLOWED_CONTENT_TYPES = [
    "application/json",
    "application/xml",
    "application/x-ndjson",
    "text/plain",
    "text/csv",
    "text/xml",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const DEFAULT_CONTENT_TYPE: AllowedContentType = "application/json";

export function isAllowedContentType(value: string): value is AllowedContentType {
    return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(baseType(value));
}

/** `application/json; charset=utf-8` → `application/json`, lower-cased. */
export function baseType(value: string): string {
    return value.split(";")[0].trim().toLowerCase();
}

/**
 * The type actually sent. Anything outside the allowlist collapses to
 * `text/plain` rather than being refused, because a stored value can predate a
 * narrowing of the list and the response is still worth serving — just not
 * under a type that makes it executable.
 */
export function resolveContentType(requested: string): string {
    const base = baseType(requested);

    return isAllowedContentType(base) ? `${base}; charset=utf-8` : "text/plain; charset=utf-8";
}

/** True when the body should be parsed as JSON on the way in. */
export function isJsonType(value: string): boolean {
    const base = baseType(value);

    return base === "application/json" || base.endsWith("+json");
}
