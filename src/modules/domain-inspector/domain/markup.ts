import type { PageLicense } from "../types";

/**
 * The four things worth reading out of a page's markup: its title, the
 * generator it admits to, the licence it declares, and the raw text every
 * fingerprint is matched against.
 *
 * Deliberately regex over a parser. This never renders the page, never executes
 * anything on it, and only ever looks at the head and the script tags — a DOM
 * implementation for that is a large dependency and a much larger surface for a
 * hostile document to poke at. What it costs is exactness on malformed markup,
 * and a missed `<title>` is a blank field rather than a wrong answer.
 */

const ENTITIES: Readonly<Record<string, string>> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    apos: "'",
    nbsp: " ",
};

export function decodeEntities(text: string): string {
    return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
        const named = ENTITIES[name.toLowerCase()];

        if (named !== undefined) {
            return named;
        }

        const numeric = /^#x/i.test(name)
            ? Number.parseInt(name.slice(2), 16)
            : /^#/.test(name)
              ? Number.parseInt(name.slice(1), 10)
              : Number.NaN;

        return Number.isInteger(numeric) && numeric > 0 && numeric <= 0x10ffff
            ? String.fromCodePoint(numeric)
            : whole;
    });
}

export function readPageTitle(html: string): string | null {
    const matched = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);

    if (matched === null) {
        return null;
    }

    const title = decodeEntities(matched[1]).replace(/\s+/g, " ").trim();

    return title.length > 0 ? title : null;
}

/** Reads one attribute out of a tag's attribute soup, quoted either way. */
export function readAttribute(tag: string, attribute: string): string | null {
    const pattern = new RegExp(`\\b${attribute}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
    const matched = pattern.exec(tag);

    if (matched === null) {
        return null;
    }

    const value = matched[2] ?? matched[3] ?? matched[4] ?? "";

    return value.length > 0 ? decodeEntities(value) : null;
}

function findMeta(html: string, name: string): string | null {
    const pattern = new RegExp(`<meta\\b[^>]*\\bname\\s*=\\s*["']?${name}["']?[^>]*>`, "i");
    const tag = pattern.exec(html)?.[0];

    return tag === undefined ? null : readAttribute(tag, "content");
}

/** `<meta name="generator" content="WordPress 6.5">` — the CMS naming itself. */
export function readGenerator(html: string): string | null {
    return findMeta(html, "generator");
}

/**
 * A site's own statement about how its content may be reused: the
 * `rel="license"` link relation, or the older `<meta name="license">`. Reported
 * exactly as declared, because this is the publisher's claim and not ours.
 */
export function readDeclaredLicense(html: string): PageLicense | null {
    const linkTag = /<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\blicense\b[^"'>]*["']?[^>]*>/i.exec(
        html,
    )?.[0];

    if (linkTag !== undefined) {
        const href = readAttribute(linkTag, "href");
        const title = readAttribute(linkTag, "title");

        if (href !== null || title !== null) {
            return { name: title, url: href };
        }
    }

    const meta = findMeta(html, "license");

    if (meta === null) {
        return null;
    }

    return /^https?:\/\//i.test(meta) ? { name: null, url: meta } : { name: meta, url: null };
}
