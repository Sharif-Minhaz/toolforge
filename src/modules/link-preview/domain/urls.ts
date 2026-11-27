import type { PreviewTags } from "../types";
import { MAX_PROBED_IMAGES } from "./constants";

/**
 * The addresses a page writes into its tags, read the way a crawler reads them.
 *
 * Every platform resolves a relative `og:image` differently — some against the
 * page, some not at all — so the debugger resolves it to draw the card and
 * reports separately that it was relative. Both facts matter: the card shows
 * what the most forgiving crawler would show, and the finding warns about the
 * least forgiving one.
 */

export type ResolvedUrl = {
    /** Absolute `http:` or `https:` address, or `null` when it cannot be one. */
    readonly absolute: string | null;
    /** True when the page wrote it without a scheme and host. */
    readonly relative: boolean;
    /** True when the absolute form is plain `http:`. */
    readonly insecure: boolean;
};

const UNRESOLVABLE: ResolvedUrl = { absolute: null, relative: false, insecure: false };

export function resolveTagUrl(raw: string, base: URL | null): ResolvedUrl {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
        return UNRESOLVABLE;
    }

    // Scheme-relative (`//cdn.example/a.png`) is relative too: a crawler with
    // no page scheme to inherit has nothing to put in front of it.
    const relative = !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);

    let url: URL;

    try {
        url = base === null ? new URL(trimmed) : new URL(trimmed, base);
    } catch {
        return { ...UNRESOLVABLE, relative };
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ...UNRESOLVABLE, relative };
    }

    return { absolute: url.toString(), relative, insecure: url.protocol === "http:" };
}

/**
 * The host as a card prints it: lower-case, `www.` dropped, Punycode left as
 * it is. Every platform drops the `www.`; none of them decodes an IDN, because
 * a decoded name is exactly what a homograph attack wants shown.
 */
export function displayHost(url: URL): string {
    return url.hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Two addresses that name the same page, compared the way a crawler
 * de-duplicates shares: scheme and host case-folded, a trailing slash on the
 * path ignored, the fragment dropped. The query is kept — `?id=1` and `?id=2`
 * are two pages.
 */
export function isSamePage(left: string, right: string): boolean {
    let a: URL;
    let b: URL;

    try {
        a = new URL(left);
        b = new URL(right);
    } catch {
        return false;
    }

    const path = (url: URL) => url.pathname.replace(/\/+$/, "") || "/";

    return (
        a.protocol === b.protocol &&
        a.host.toLowerCase() === b.host.toLowerCase() &&
        path(a) === path(b) &&
        a.search === b.search
    );
}

/** The distinct pictures any card would pick: `og:image`, then `twitter:image`. */
export function picturesToProbe(tags: PreviewTags, base: URL | null): string[] {
    const candidates = [tags.og.images[0]?.url ?? null, tags.twitter.image];
    const urls: string[] = [];

    for (const raw of candidates) {
        if (raw === null) {
            continue;
        }

        const absolute = resolveTagUrl(raw, base).absolute;

        if (absolute !== null && !urls.includes(absolute)) {
            urls.push(absolute);
        }
    }

    return urls.slice(0, MAX_PROBED_IMAGES);
}

/**
 * What the reader typed, as an address to fetch: trimmed, and given `https://`
 * when it has no scheme at all — `example.com/post` is what people paste from
 * an address bar that hides the scheme. Anything with a scheme is left alone,
 * so `ftp://` still reaches the scheme check and is refused by name.
 */
export function normalizeTypedUrl(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed.length === 0 || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
        return trimmed;
    }

    return `https://${trimmed.replace(/^\/+/, "")}`;
}
