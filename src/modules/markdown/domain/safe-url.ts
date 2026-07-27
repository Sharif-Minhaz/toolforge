import { SAFE_URL_SCHEMES } from "./constants";

const SAFE_SCHEMES: ReadonlySet<string> = new Set(SAFE_URL_SCHEMES);

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/;

/**
 * SVG carries script, so it is the one image type a `data:` URL may not use.
 * The raster formats are inert.
 */
const SAFE_IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon);/i;

/**
 * Drops the characters a browser removes before it parses a URL — every code
 * point at or below `U+0020`, plus `DEL`. Without this, `java&#9;script:` reads
 * as a foreign scheme here and as `javascript:` at navigation time.
 */
function stripControlCharacters(url: string): string {
    let stripped = "";

    for (const character of url) {
        const code = character.codePointAt(0) ?? 0;

        if (code > 0x20 && code !== 0x7f) {
            stripped += character;
        }
    }

    return stripped;
}

function schemeOf(url: string): string | null {
    return SCHEME.exec(stripControlCharacters(url))?.[1].toLowerCase() ?? null;
}

/**
 * The href a link may navigate to, or `null` when the scheme is one the preview
 * refuses. A relative URL — `/docs/a.md`, `./b`, `#anchor` — carries no scheme
 * and is always allowed; it cannot execute anything on its own.
 *
 * Returning `null` rather than a scrubbed string is deliberate: the renderer
 * then draws the label as plain text, so a blocked link is visibly not a link
 * instead of a silently dead one.
 */
export function safeLinkHref(href: string): string | null {
    const trimmed = href.trim();

    if (trimmed.length === 0) {
        return null;
    }

    const scheme = schemeOf(trimmed);

    return scheme === null || SAFE_SCHEMES.has(scheme) ? trimmed : null;
}

/** As `safeLinkHref`, plus inline raster `data:` images, which cannot script. */
export function safeImageSrc(src: string): string | null {
    const trimmed = src.trim();

    if (SAFE_IMAGE_DATA.test(stripControlCharacters(trimmed))) {
        return trimmed;
    }

    const scheme = schemeOf(trimmed);

    // `mailto:` and `tel:` are valid links but never images.
    if (scheme !== null && (scheme === "mailto" || scheme === "tel")) {
        return null;
    }

    return safeLinkHref(trimmed);
}
