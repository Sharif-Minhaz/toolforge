import { SERVICE_DOMAIN, serviceBase, serviceHostname } from "@/modules/tools/domain/service-hosts";

import type { ShortLinkTool } from "../types";
import {
    MAX_TARGET_URL_LENGTH,
    REDIRECT_PREFIXES,
    SHORTENER_SERVICE,
    TOOL_PREFIXES,
} from "./constants";

/**
 * Where a short link is allowed to point, and how its own address is built.
 */

export type TargetUrlFailureReason = "empty" | "too_long" | "not_a_url" | "unsupported_scheme";

export type TargetUrlResult =
    | { readonly ok: true; readonly url: string }
    | { readonly ok: false; readonly reason: TargetUrlFailureReason };

/**
 * Only `http:` and `https:` — a short link is a redirect the visitor never sees
 * before it happens, so `javascript:` or `data:` behind one would be a hosted
 * attack rather than a convenience.
 */
export function parseTargetUrl(raw: string): TargetUrlResult {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (trimmed.length > MAX_TARGET_URL_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    // A bare host is what people paste, and prefixing it is what they meant.
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let url: URL;

    try {
        url = new URL(candidate);
    } catch {
        return { ok: false, reason: "not_a_url" };
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ok: false, reason: "unsupported_scheme" };
    }

    if (url.hostname.length === 0) {
        return { ok: false, reason: "not_a_url" };
    }

    return { ok: true, url: url.toString() };
}

/**
 * Whether a target points back at one of this site's own redirect routes.
 *
 * Both prefixes are checked, not just the one the caller belongs to: a chain of
 * short links on this host could otherwise hide a destination behind several
 * hops, which is exactly what a redirect service must not make easy. It is also
 * why this is checked at creation and at update, rather than followed later.
 * Every path on the short-link subdomain is a redirect, so that host is refused
 * whole.
 */
export function isSelfReferential(
    target: string,
    origin: string,
    domain: string | null = SERVICE_DOMAIN,
): boolean {
    try {
        const url = new URL(target);
        const site = new URL(origin);

        if (url.hostname === serviceHostname(SHORTENER_SERVICE, domain)) {
            return true;
        }

        if (url.host !== site.host) {
            return false;
        }

        return REDIRECT_PREFIXES.some(
            (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
        );
    } catch {
        return false;
    }
}

/** The two addresses a tool's links hang off, each without a trailing slash. */
export type LinkBases = { readonly redirect: string; readonly edit: string };

/**
 * A shortener link goes out on the short-link subdomain when the page was
 * served from inside the service domain (`host`), and on `/s` everywhere else.
 * A QR link always keeps the main site's path — a printed code cannot follow a
 * lapsed domain — and so does every edit link, which is this site's own page.
 */
export function linkBases(
    tool: ShortLinkTool,
    origin: string,
    host: string | null,
    domain: string | null = SERVICE_DOMAIN,
): LinkBases {
    const site = origin.replace(/\/$/, "");
    const prefixes = TOOL_PREFIXES[tool];

    return {
        redirect:
            tool === "shortener"
                ? serviceBase(SHORTENER_SERVICE, site, host, domain)
                : `${site}${prefixes.redirect}`,
        edit: `${site}${prefixes.edit}`,
    };
}
