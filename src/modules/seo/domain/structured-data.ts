import type { Locale } from "@/i18n/config";
import { absoluteUrl, OG_IMAGE, SITE_AUTHOR, SITE_NAME } from "./site";

export type FaqEntry = {
    readonly question: string;
    readonly answer: string;
};

export type ToolJsonLdInput = {
    readonly name: string;
    readonly description: string;
    /** Root-relative, e.g. `/tools/uuid`. */
    readonly path: string;
    readonly locale: Locale;
    readonly keywords?: readonly string[];
    readonly faqs?: readonly FaqEntry[];
};

/**
 * The schema.org graph every tool page emits: the app itself, its FAQ, and the
 * breadcrumb back to the catalogue. Kept in one place so a new tool inherits
 * the same shape instead of copying a slightly different one.
 *
 * `FAQPage` is omitted entirely when there are no questions — an empty
 * `mainEntity` is a structured-data warning in Search Console, not a no-op.
 */
export function buildToolJsonLd({
    name,
    description,
    path,
    locale,
    keywords,
    faqs = [],
}: ToolJsonLdInput): Record<string, unknown> {
    const url = absoluteUrl(path);

    const application = {
        "@type": "SoftwareApplication",
        name,
        description,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        url,
        image: absoluteUrl(OG_IMAGE.url),
        inLanguage: locale,
        browserRequirements: "Requires JavaScript.",
        isAccessibleForFree: true,
        ...(keywords?.length ? { keywords: keywords.join(", ") } : {}),
        author: { "@type": "Person", name: SITE_AUTHOR },
        publisher: { "@type": "Organization", name: SITE_NAME },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    };

    const faqPage = {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
    };

    const breadcrumbs = {
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name, item: url },
        ],
    };

    return {
        "@context": "https://schema.org",
        "@graph":
            faqs.length > 0 ? [application, faqPage, breadcrumbs] : [application, breadcrumbs],
    };
}
