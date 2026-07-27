import { describe, expect, test } from "bun:test";

import { buildPageMetadata, SITE_ATTRIBUTION } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { OG_IMAGE, SITE_KEYWORDS, SITE_NAME, SITE_URL } from "@/modules/seo/domain/site";

const BASE = {
    title: "Base64 Encoder and Decoder",
    description: "Encode and decode Base64 in the browser.",
    path: "/tools/base64",
    locale: "en",
} as const;

describe("buildPageMetadata", () => {
    test("keeps the canonical URL root-relative so it resolves against metadataBase", () => {
        expect(buildPageMetadata(BASE).alternates?.canonical).toBe("/tools/base64");
    });

    test("gives Open Graph the absolute URL", () => {
        expect(buildPageMetadata(BASE).openGraph?.url).toBe(`${SITE_URL}/tools/base64`);
    });

    test("attaches the shared card to both Open Graph and Twitter", () => {
        const metadata = buildPageMetadata(BASE);

        // A page that declares openGraph replaces the layout's entirely, so the
        // image has to be present on every single page.
        expect(metadata.openGraph?.images).toEqual([
            { ...OG_IMAGE, alt: `${BASE.title} — ${SITE_NAME}` },
        ]);
        expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images);
    });

    test("uses a large summary card, which is what a 1200x630 image needs", () => {
        // `Metadata["twitter"]` is a union whose members do not all carry `card`,
        // so match the shape rather than reaching for the property.
        expect(buildPageMetadata(BASE).twitter).toMatchObject({ card: "summary_large_image" });
    });

    test("prefers a caller-supplied image alt", () => {
        const metadata = buildPageMetadata({ ...BASE, imageAlt: "A screenshot" });

        expect(metadata.openGraph?.images).toEqual([{ ...OG_IMAGE, alt: "A screenshot" }]);
    });

    test("leads with page keywords and appends the site-wide ones", () => {
        const keywords = buildPageMetadata({ ...BASE, keywords: ["b64", "btoa"] });

        expect(keywords.keywords).toEqual(["b64", "btoa", ...SITE_KEYWORDS]);
    });

    test("still emits the site-wide keywords when a page supplies none", () => {
        expect(buildPageMetadata(BASE).keywords).toEqual([...SITE_KEYWORDS]);
    });

    test("drops duplicates so the tag never repeats a term", () => {
        const metadata = buildPageMetadata({
            ...BASE,
            keywords: ["Developer Tools", "b64", "developer tools"],
        });

        expect(metadata.keywords).toEqual(["developer tools", "b64", ...rest(SITE_KEYWORDS)]);
    });

    for (const [locale, expected] of [
        ["en", "en_US"],
        ["bn", "bn_BD"],
    ] as const) {
        test(`maps the ${locale} locale to the Open Graph tag ${expected}`, () => {
            expect(buildPageMetadata({ ...BASE, locale }).openGraph?.locale).toBe(expected);
        });
    }
});

describe("SITE_ATTRIBUTION", () => {
    test("names the same person as author, creator, and publisher", () => {
        expect(SITE_ATTRIBUTION.creator).toBe(SITE_ATTRIBUTION.publisher);
        expect(SITE_ATTRIBUTION.authors[0].name).toBe(SITE_ATTRIBUTION.creator);
    });
});

describe("buildToolJsonLd", () => {
    const FAQS = [{ question: "Is it free?", answer: "Yes." }];

    function graphOf(data: Record<string, unknown>): Record<string, unknown>[] {
        return data["@graph"] as Record<string, unknown>[];
    }

    test("emits the application, the FAQ, and the breadcrumb", () => {
        const graph = graphOf(buildToolJsonLd({ ...BASE, name: BASE.title, faqs: FAQS }));

        expect(graph.map((node) => node["@type"])).toEqual([
            "SoftwareApplication",
            "FAQPage",
            "BreadcrumbList",
        ]);
    });

    test("omits FAQPage entirely when the tool has no questions", () => {
        const graph = graphOf(buildToolJsonLd({ ...BASE, name: BASE.title }));

        // An empty mainEntity is a Search Console warning, not a harmless no-op.
        expect(graph.map((node) => node["@type"])).toEqual([
            "SoftwareApplication",
            "BreadcrumbList",
        ]);
    });

    test("marks the tool free and reachable without an account", () => {
        const [application] = graphOf(buildToolJsonLd({ ...BASE, name: BASE.title }));

        expect(application.isAccessibleForFree).toBe(true);
        expect(application.offers).toMatchObject({ price: "0" });
    });

    test("points the breadcrumb at the site root then the tool", () => {
        const graph = graphOf(buildToolJsonLd({ ...BASE, name: BASE.title }));
        const crumbs = graph.at(-1)?.itemListElement as Record<string, unknown>[];

        expect(crumbs.map((crumb) => crumb.item)).toEqual([
            `${SITE_URL}/`,
            `${SITE_URL}/tools/base64`,
        ]);
    });

    test("serialises keywords as a comma-separated string, as schema.org expects", () => {
        const [application] = graphOf(
            buildToolJsonLd({ ...BASE, name: BASE.title, keywords: ["b64", "btoa"] }),
        );

        expect(application.keywords).toBe("b64, btoa");
    });

    test("leaves the keywords property off when there are none", () => {
        const [application] = graphOf(buildToolJsonLd({ ...BASE, name: BASE.title, keywords: [] }));

        expect("keywords" in application).toBe(false);
    });

    test("carries the active locale through to inLanguage", () => {
        const [application] = graphOf(buildToolJsonLd({ ...BASE, name: BASE.title, locale: "bn" }));

        expect(application.inLanguage).toBe("bn");
    });
});

/** SITE_KEYWORDS minus any term the test already asserted in the leading slots. */
function rest(keywords: readonly string[]): string[] {
    return keywords.filter((keyword) => keyword !== "developer tools");
}
