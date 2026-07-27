import type { Metadata } from "next";

import type { Locale } from "@/i18n/config";
import { absoluteUrl, OG_IMAGE, OG_LOCALES, SITE_AUTHOR, SITE_KEYWORDS, SITE_NAME } from "./site";

/**
 * Builds the metadata block every page shares: canonical URL, Open Graph card,
 * and Twitter card. Pure — it takes strings that were translated by the caller,
 * so it stays in `domain/` and can be unit tested without a request.
 *
 * Next shallow-merges metadata, which means a page that declares `openGraph`
 * replaces the layout's entirely. Every page therefore has to spell out the
 * image, and this is how it does so without repeating itself.
 */
export type PageMetadataInput = {
    readonly title: string;
    readonly description: string;
    /** Root-relative, e.g. `/tools/uuid`. */
    readonly path: string;
    readonly locale: Locale;
    /** Page-specific terms; the site-wide ones are added automatically. */
    readonly keywords?: readonly string[];
    /** Describes the social card to a screen reader, so it needs the page name. */
    readonly imageAlt?: string;
};

export function buildPageMetadata({
    title,
    description,
    path,
    locale,
    keywords = [],
    imageAlt,
}: PageMetadataInput): Metadata {
    const url = absoluteUrl(path);
    const image = {
        ...OG_IMAGE,
        alt: imageAlt ?? `${title} — ${SITE_NAME}`,
    };

    return {
        title,
        description,
        keywords: dedupeKeywords([...keywords, ...SITE_KEYWORDS]),
        alternates: { canonical: path },
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            locale: OG_LOCALES[locale],
            title,
            description,
            url,
            images: [image],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    };
}

/**
 * Keeps the first occurrence so page-specific terms lead, and drops repeats —
 * a keyword list that says the same thing twice reads as spam.
 */
function dedupeKeywords(keywords: readonly string[]): string[] {
    return [...new Set(keywords.map((keyword) => keyword.toLowerCase()))];
}

/** Author and publisher fields, identical on every page. */
export const SITE_ATTRIBUTION = {
    authors: [{ name: SITE_AUTHOR }],
    creator: SITE_AUTHOR,
    publisher: SITE_AUTHOR,
} as const satisfies Pick<Metadata, "authors" | "creator" | "publisher">;
