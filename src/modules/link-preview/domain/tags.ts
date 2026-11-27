import { decodeEntities } from "@/modules/tools/domain/html-entities";

import type {
    DocumentTags,
    HeadTag,
    MetaKeyAttribute,
    OpenGraphImage,
    OpenGraphTags,
    PreviewTags,
    TwitterLabel,
    TwitterTags,
} from "../types";

/**
 * Reads the tags a link-preview crawler reads, out of markup a stranger wrote.
 *
 * Regex over a tokenizer, for the reason the Domain Inspector gives in
 * `markup.ts`: nothing here renders the page or runs anything on it, and a DOM
 * implementation is a large dependency and a larger surface for a hostile
 * document. The crawlers being imitated are not browsers either — Facebook's
 * and Slack's read the head as text and stop — so a reader that tolerates
 * the same malformations they tolerate is closer to them than a spec-perfect
 * parser would be.
 *
 * Two things are done more carefully than a one-line regex would:
 *
 * - **Attributes are tokenized**, not searched. `\bname=` also matches
 *   `data-name=`, and `<meta data-name="x" property="og:title">` is real
 *   markup from real component libraries.
 * - **A quoted `>` does not end a tag.** `content="5 > 3"` is a legal
 *   attribute value and a regex that stops at the first `>` reads half of it.
 *
 * No pattern here is module-level with a `g` flag. A global `RegExp` carries
 * `lastIndex` between calls, which is mutable state shared by every request the
 * server handles. Each one that needs `g` is built inside the function using it.
 */

/** Everything a head-reader should not mistake for the head. */
function stripInert(html: string): string {
    return (
        html
            .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
            // A script that writes `<meta property="og:title">` into the page
            // at runtime is precisely what no crawler executes, so a tag
            // inside one must not count.
            .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, "")
            .replace(/<style\b[\s\S]*?(?:<\/style\s*>|$)/gi, "")
            .replace(/<template\b[\s\S]*?(?:<\/template\s*>|$)/gi, "")
            // An inline icon's `<title>` is the most common second title on a
            // page, and it is not the page's.
            .replace(/<svg\b[\s\S]*?(?:<\/svg\s*>|$)/gi, "")
    );
}

/**
 * The part of a document the crawlers read.
 *
 * Up to `</head>` when there is one, else up to `<body`, else everything that
 * arrived. A page with no head element at all is legal HTML — the parser
 * implies one — and its tags still count.
 */
export function sliceHead(html: string): string {
    const inert = stripInert(html);
    const headEnd = inert.search(/<\/head\s*>/i);

    if (headEnd >= 0) {
        return inert.slice(0, headEnd);
    }

    const bodyStart = inert.search(/<body\b/i);

    return bodyStart >= 0 ? inert.slice(0, bodyStart) : inert;
}

/**
 * One tag's attributes, lower-cased by name, first occurrence wins.
 *
 * "First wins" is the HTML parser's own rule for a duplicated attribute, so
 * `<meta content="a" content="b">` means `a` here for the same reason it does
 * in a browser.
 */
export function parseAttributes(source: string): ReadonlyMap<string, string> {
    const attributes = new Map<string, string>();
    const pattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

    for (const match of source.matchAll(pattern)) {
        const name = match[1].toLowerCase();

        if (attributes.has(name)) {
            continue;
        }

        attributes.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
    }

    return attributes;
}

/** Collapses the whitespace inside a value the way every card renders it. */
function tidy(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function metaKey(
    attributes: ReadonlyMap<string, string>,
): { key: string; attribute: MetaKeyAttribute } | null {
    // `property` before `name`, because Open Graph is specified on `property`
    // and a tag carrying both means it as Open Graph.
    const property = attributes.get("property");

    if (property !== undefined && property.trim().length > 0) {
        return { key: property.trim().toLowerCase(), attribute: "property" };
    }

    const name = attributes.get("name");

    if (name !== undefined && name.trim().length > 0) {
        return { key: name.trim().toLowerCase(), attribute: "name" };
    }

    return null;
}

/** Every `<meta>`, `<link>` and `<title>` in the head, in document order. */
export function readHeadTags(html: string): HeadTag[] {
    const head = sliceHead(html);
    const tags: HeadTag[] = [];
    // The alternation is unambiguous on its first character, so this is linear
    // in the length of the tag rather than exponential in the number of quotes.
    const pattern =
        /<(meta|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi;

    for (const match of head.matchAll(pattern)) {
        if (match[3] !== undefined) {
            tags.push({
                kind: "title",
                key: "title",
                value: tidy(decodeEntities(match[3])),
                attribute: null,
            });

            continue;
        }

        const attributes = parseAttributes(match[2] ?? "");

        if (match[1].toLowerCase() === "link") {
            const rel = attributes.get("rel");
            const href = attributes.get("href");

            if (rel !== undefined && href !== undefined) {
                tags.push({
                    kind: "link",
                    key: tidy(rel).toLowerCase(),
                    value: href.trim(),
                    attribute: null,
                });
            }

            continue;
        }

        const key = metaKey(attributes);
        const content = attributes.get("content");

        if (key !== null && content !== undefined) {
            tags.push({ kind: "meta", key: key.key, value: content, attribute: key.attribute });
        }
    }

    return tags;
}

function firstMeta(tags: readonly HeadTag[], key: string): string | null {
    for (const tag of tags) {
        if (tag.kind === "meta" && tag.key === key) {
            const value = tidy(tag.value);

            return value.length > 0 ? value : null;
        }
    }

    return null;
}

function relTokens(rel: string): string[] {
    return rel.split(/\s+/).filter((token) => token.length > 0);
}

function firstLink(tags: readonly HeadTag[], rel: string): string | null {
    for (const tag of tags) {
        if (tag.kind === "link" && relTokens(tag.key).includes(rel) && tag.value.length > 0) {
            return tag.value;
        }
    }

    return null;
}

function readPositiveInteger(value: string): number | null {
    const trimmed = value.trim();

    if (!/^\d{1,6}$/.test(trimmed)) {
        return null;
    }

    const parsed = Number.parseInt(trimmed, 10);

    return parsed > 0 ? parsed : null;
}

/**
 * `og:image` and the structured properties that follow it.
 *
 * Grouped by position rather than by key, because that is the protocol: an
 * `og:image:width` belongs to the nearest `og:image` above it. A structured
 * property with no image above it is attached to nothing, which is what every
 * platform does with it too.
 */
export function readOpenGraphImages(tags: readonly HeadTag[]): OpenGraphImage[] {
    const images: OpenGraphImage[] = [];

    for (const tag of tags) {
        if (tag.kind !== "meta" || !tag.key.startsWith("og:image")) {
            continue;
        }

        const value = tag.value.trim();

        if (tag.key === "og:image" || tag.key === "og:image:url") {
            // `og:image:url` straight after an `og:image` is the same picture
            // said twice, not a second one.
            const previous = images.at(-1);

            if (tag.key === "og:image:url" && previous !== undefined && previous.url === value) {
                continue;
            }

            if (value.length > 0) {
                images.push({
                    url: value,
                    secureUrl: null,
                    type: null,
                    width: null,
                    height: null,
                    alt: null,
                });
            }

            continue;
        }

        const current = images.at(-1);

        if (current === undefined || value.length === 0) {
            continue;
        }

        const patched: OpenGraphImage =
            tag.key === "og:image:secure_url"
                ? { ...current, secureUrl: current.secureUrl ?? value }
                : tag.key === "og:image:type"
                  ? { ...current, type: current.type ?? value.toLowerCase() }
                  : tag.key === "og:image:width"
                    ? { ...current, width: current.width ?? readPositiveInteger(value) }
                    : tag.key === "og:image:height"
                      ? { ...current, height: current.height ?? readPositiveInteger(value) }
                      : tag.key === "og:image:alt"
                        ? { ...current, alt: current.alt ?? tidy(value) }
                        : current;

        images[images.length - 1] = patched;
    }

    return images;
}

function readOpenGraph(tags: readonly HeadTag[]): OpenGraphTags {
    return {
        title: firstMeta(tags, "og:title"),
        description: firstMeta(tags, "og:description"),
        url: firstMeta(tags, "og:url"),
        type: firstMeta(tags, "og:type"),
        siteName: firstMeta(tags, "og:site_name"),
        locale: firstMeta(tags, "og:locale"),
        images: readOpenGraphImages(tags),
    };
}

function readTwitterLabels(tags: readonly HeadTag[]): TwitterLabel[] {
    const labels: TwitterLabel[] = [];

    // Slack renders two, and only the numbered pairs it documents.
    for (const index of [1, 2]) {
        const label = firstMeta(tags, `twitter:label${index}`);
        const data = firstMeta(tags, `twitter:data${index}`);

        if (label !== null && data !== null) {
            labels.push({ label, data });
        }
    }

    return labels;
}

function readTwitter(tags: readonly HeadTag[]): TwitterTags {
    return {
        card: firstMeta(tags, "twitter:card")?.toLowerCase() ?? null,
        title: firstMeta(tags, "twitter:title"),
        description: firstMeta(tags, "twitter:description"),
        // `twitter:image:src` is the pre-2015 spelling, still in old templates
        // and still honoured.
        image: firstMeta(tags, "twitter:image") ?? firstMeta(tags, "twitter:image:src"),
        imageAlt: firstMeta(tags, "twitter:image:alt"),
        site: firstMeta(tags, "twitter:site"),
        creator: firstMeta(tags, "twitter:creator"),
        labels: readTwitterLabels(tags),
    };
}

function readOembed(html: string): string | null {
    const head = sliceHead(html);
    const pattern = /<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

    for (const match of head.matchAll(pattern)) {
        const attributes = parseAttributes(match[1] ?? "");
        const rel = attributes.get("rel") ?? "";
        const type = (attributes.get("type") ?? "").trim().toLowerCase();
        const href = (attributes.get("href") ?? "").trim();

        if (
            relTokens(rel.toLowerCase()).includes("alternate") &&
            type === "application/json+oembed" &&
            href.length > 0
        ) {
            return href;
        }
    }

    return null;
}

function readLang(html: string): string | null {
    const tag = /<html\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i.exec(html);

    if (tag === null) {
        return null;
    }

    const lang =
        parseAttributes(tag[1] ?? "")
            .get("lang")
            ?.trim() ?? "";

    return lang.length > 0 ? lang : null;
}

function readDocument(html: string, tags: readonly HeadTag[]): DocumentTags {
    const title = tags.find((tag) => tag.kind === "title" && tag.value.length > 0)?.value ?? null;

    return {
        title,
        description: firstMeta(tags, "description"),
        canonical: firstLink(tags, "canonical"),
        themeColor: firstMeta(tags, "theme-color"),
        icon: firstLink(tags, "icon") ?? firstLink(tags, "apple-touch-icon"),
        oembed: readOembed(html),
        lang: readLang(html),
    };
}

/** The whole reading: every tag in order, plus the fields read out of them. */
export function readPreviewTags(html: string): PreviewTags {
    const tags = readHeadTags(html);

    return {
        document: readDocument(html, tags),
        og: readOpenGraph(tags),
        twitter: readTwitter(tags),
        tags,
    };
}
