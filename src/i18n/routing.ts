import { GRAPHQL_EXECUTION_PREFIX } from "@/modules/graphql-server/domain/constants";
import { JSON_EXECUTION_PREFIX } from "@/modules/json-server/domain/constants";
import { MOCK_EXECUTION_PREFIX } from "@/modules/mock-server/domain/constants";
import {
    QR_REDIRECT_PREFIX,
    SHORTENER_REDIRECT_PREFIX,
} from "@/modules/short-links/domain/constants";

import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/**
 * Top-level routes that live outside `app/[locale]`: route handlers that answer
 * somebody else's client, and so carry no language. `routing.test.ts` fails
 * when a new top-level folder under `src/app` is missing from here.
 */
export const UNLOCALIZED_ROUTES: readonly string[] = [
    "/api",
    MOCK_EXECUTION_PREFIX,
    JSON_EXECUTION_PREFIX,
    GRAPHQL_EXECUTION_PREFIX,
    QR_REDIRECT_PREFIX,
    SHORTENER_REDIRECT_PREFIX,
];

// A last segment with an extension is a file — `robots.txt`, a public font, a
// model weight — never a page. No page segment contains a dot: aliases are
// `[a-z0-9-]` and every id and token is url-safe base64 or a cuid.
const FILE_PATTERN = /\/[^/]*\.[A-Za-z0-9]+$/;

/** The cookie value, or the default when it is unset or not a locale we ship. */
export function resolveLocale(cookieValue: string | undefined): Locale {
    return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}

/**
 * The internal `app/[locale]` path a canonical page path renders from, or
 * `null` when the path is not a page. The browser keeps the canonical URL; only
 * the proxy's rewrite sees the prefix, so `/tools/uuid` stays `/tools/uuid` for
 * readers and crawlers while each language still prerenders as a static page.
 */
export function localizePath(pathname: string, locale: Locale): string | null {
    if (pathname.startsWith("/_") || FILE_PATTERN.test(pathname)) {
        return null;
    }

    const isUnlocalized = UNLOCALIZED_ROUTES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

    if (isUnlocalized) {
        return null;
    }

    return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}
