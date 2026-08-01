import type { ShortLink, ShortLinkCreatedView, ShortLinkResult, ShortLinkView } from "../types";
import { parseAlias } from "./alias";
import { buildEditUrl, buildShortUrl, isSelfReferential, parseTargetUrl } from "./target";

/**
 * The pure steps every short-link action performs: checking what it was given,
 * and shaping a stored row for the browser.
 *
 * Here rather than in `actions/` so they can be tested without a request, a
 * database, or a Turnstile secret.
 */

/**
 * Where a short link may point, as one predicate.
 *
 * `isSelfReferential` is not a nicety. Without it a chain of short links on this
 * host could be used to hide a destination behind several hops, which is exactly
 * what a redirect service must not make easy.
 */
export function checkTarget(raw: string, origin: string): ShortLinkResult<string> {
    const parsed = parseTargetUrl(raw);

    if (!parsed.ok) {
        switch (parsed.reason) {
            case "too_long":
                return { ok: false, reason: "target_too_long" };
            case "unsupported_scheme":
                return { ok: false, reason: "unsupported_scheme" };
            default:
                return { ok: false, reason: "invalid_target" };
        }
    }

    if (isSelfReferential(parsed.url, origin)) {
        return { ok: false, reason: "self_referential" };
    }

    return { ok: true, value: parsed.url };
}

/**
 * An optional alias, folded into the shared failure vocabulary. A blank field
 * is not an error — it means "draw one for me".
 */
export function checkAlias(raw: string | null): ShortLinkResult<string | null> {
    if (raw === null || raw.trim().length === 0) {
        return { ok: true, value: null };
    }

    const parsed = parseAlias(raw);

    if (parsed.ok) {
        return { ok: true, value: parsed.alias };
    }

    return { ok: false, reason: parsed.reason === "reserved" ? "alias_reserved" : "invalid_alias" };
}

export function toLinkView(link: ShortLink, origin: string, prefix: string): ShortLinkView {
    return {
        slug: link.slug,
        shortUrl: buildShortUrl(link.slug, origin, prefix),
        target: link.target,
        hasPassword: link.hasPassword,
        startsAt: link.startsAt?.toISOString() ?? null,
        expiresAt: link.expiresAt?.toISOString() ?? null,
        scans: link.scans,
        createdAt: link.createdAt.toISOString(),
        lastScanAt: link.lastScanAt?.toISOString() ?? null,
    };
}

export function toCreatedView(
    link: ShortLink,
    editToken: string,
    origin: string,
    prefixes: { readonly redirect: string; readonly edit: string },
): ShortLinkCreatedView {
    return {
        ...toLinkView(link, origin, prefixes.redirect),
        editUrl: buildEditUrl(editToken, origin, prefixes.edit),
    };
}
