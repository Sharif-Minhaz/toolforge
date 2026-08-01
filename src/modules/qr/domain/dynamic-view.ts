import type {
    DynamicQrCreatedView,
    DynamicQrLink,
    DynamicQrLinkView,
    DynamicQrResult,
} from "../types";
import { buildEditUrl, buildShortUrl, isSelfReferential, parseTargetUrl } from "./short-code";

/**
 * The two pure steps either dynamic-code action performs: checking where a code
 * is allowed to point, and shaping a stored row for the browser.
 *
 * Both live here rather than in `actions/` so they can be tested without a
 * request, a database, or a Turnstile secret.
 */

/**
 * Where a dynamic code may point, as one predicate.
 *
 * `isSelfReferential` is not a nicety. Without it a chain of short links on this
 * host could be used to hide a destination behind several hops, which is exactly
 * what a redirect service must not make easy.
 */
export function checkTarget(raw: string, origin: string): DynamicQrResult<string> {
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

export function toLinkView(link: DynamicQrLink, origin: string): DynamicQrLinkView {
    return {
        slug: link.slug,
        shortUrl: buildShortUrl(link.slug, origin),
        target: link.target,
        scans: link.scans,
        createdAt: link.createdAt.toISOString(),
        lastScanAt: link.lastScanAt?.toISOString() ?? null,
    };
}

export function toCreatedView(
    link: DynamicQrLink,
    editToken: string,
    origin: string,
): DynamicQrCreatedView {
    return { ...toLinkView(link, origin), editUrl: buildEditUrl(editToken, origin) };
}
