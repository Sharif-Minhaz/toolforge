import { escapeHtml } from "@/modules/tools/domain/html-escape";

import type { ImageProbe, PreviewTags } from "../types";
import { resolveTagUrl } from "./urls";

/**
 * A head block that would satisfy every card, built from what the page already
 * says.
 *
 * Every value the page declared is kept — this is the reader's copy, not ours
 * to rewrite — and only the gaps are filled: an absolute address where the page
 * wrote a relative one, the measured size where none was declared, a
 * `twitter:card` chosen by whether there is a picture to make large. A value
 * nothing on the page supplies becomes the placeholder the caller passes,
 * already in the reader's language, so the snippet cannot be pasted unread.
 *
 * Every value is escaped for an attribute. The page's own copy came out of
 * markup a stranger wrote, and putting it back into markup unescaped is how a
 * `"` in a headline becomes an attribute injection in somebody's template.
 */

export type SnippetPlaceholders = {
    readonly title: string;
    readonly description: string;
    readonly image: string;
    readonly imageAlt: string;
};

export type SnippetInput = {
    readonly tags: PreviewTags;
    readonly pageUrl: URL | null;
    readonly images: readonly ImageProbe[];
    readonly placeholders: SnippetPlaceholders;
};

function meta(attribute: "property" | "name", key: string, value: string): string {
    return `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`;
}

export function buildRecommendedHead(input: SnippetInput): string {
    const { tags, pageUrl, images, placeholders } = input;
    const { og, twitter, document } = tags;

    const title = og.title ?? document.title ?? twitter.title ?? placeholders.title;
    const description =
        og.description ?? document.description ?? twitter.description ?? placeholders.description;

    const absolute = (raw: string | null) =>
        raw === null ? null : resolveTagUrl(raw, pageUrl).absolute;

    const pageAddress =
        absolute(og.url) ??
        absolute(document.canonical) ??
        (pageUrl === null ? null : pageUrl.toString());

    const declared = og.images[0];
    const image = absolute(declared?.url ?? null) ?? absolute(twitter.image);
    const probe = image === null ? undefined : images.find((entry) => entry.url === image);
    const measured = probe !== undefined && probe.ok ? probe : null;

    const width = measured?.width ?? declared?.width ?? null;
    const height = measured?.height ?? declared?.height ?? null;
    const imageType = measured?.type ?? declared?.type ?? null;

    const lines = [
        `<title>${escapeHtml(document.title ?? title)}</title>`,
        meta("name", "description", document.description ?? description),
    ];

    if (pageAddress !== null) {
        lines.push(
            `<link rel="canonical" href="${escapeHtml(absolute(document.canonical) ?? pageAddress)}">`,
        );
    }

    lines.push(
        "",
        meta("property", "og:type", og.type ?? "website"),
        ...(pageAddress === null ? [] : [meta("property", "og:url", pageAddress)]),
        meta("property", "og:title", title),
        meta("property", "og:description", description),
        ...(og.siteName === null ? [] : [meta("property", "og:site_name", og.siteName)]),
        ...(og.locale === null ? [] : [meta("property", "og:locale", og.locale)]),
        meta("property", "og:image", image ?? placeholders.image),
    );

    if (imageType !== null) {
        lines.push(meta("property", "og:image:type", imageType));
    }

    if (width !== null && height !== null) {
        lines.push(
            meta("property", "og:image:width", String(width)),
            meta("property", "og:image:height", String(height)),
        );
    }

    lines.push(
        meta(
            "property",
            "og:image:alt",
            declared?.alt ?? twitter.imageAlt ?? placeholders.imageAlt,
        ),
        "",
        // An explicit card type even when the default would do, because X,
        // Slack, Discord and Telegram all read it to pick the large card.
        meta("name", "twitter:card", twitter.card ?? "summary_large_image"),
    );

    // Only what differs from Open Graph. X falls back to `og:*` for the rest,
    // so repeating them is two places to keep in step for nothing.
    if (twitter.title !== null && twitter.title !== title) {
        lines.push(meta("name", "twitter:title", twitter.title));
    }

    if (twitter.description !== null && twitter.description !== description) {
        lines.push(meta("name", "twitter:description", twitter.description));
    }

    if (twitter.site !== null) {
        lines.push(meta("name", "twitter:site", twitter.site));
    }

    for (const [index, label] of twitter.labels.entries()) {
        lines.push(
            meta("name", `twitter:label${index + 1}`, label.label),
            meta("name", `twitter:data${index + 1}`, label.data),
        );
    }

    return lines.join("\n");
}
