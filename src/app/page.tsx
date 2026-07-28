import { getTranslations } from "next-intl/server";

import { CategoryGrid } from "@/modules/overview/components/category-grid";
import { FeaturedTools } from "@/modules/overview/components/featured-tools";
import { OpenSource } from "@/modules/overview/components/open-source";
import { OverviewHero } from "@/modules/overview/components/overview-hero";
import { QuickActions } from "@/modules/overview/components/quick-actions";
import { RecentTools } from "@/modules/overview/components/recent-tools";
import { StatGrid } from "@/modules/overview/components/stat-grid";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { absoluteUrl, OG_IMAGE, SITE_NAME, SITE_REPOSITORY } from "@/modules/seo/domain/site";
import { getAvailableTools } from "@/modules/tools/domain/tool-catalog";
import { localizeTools } from "@/modules/tools/presenters/localize-tools";

export default async function OverviewPage() {
    const [t, tools] = await Promise.all([
        getTranslations("app"),
        localizeTools(getAvailableTools()),
    ]);

    const organizationId = absoluteUrl("/#organization");

    return (
        <>
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "Organization",
                            "@id": organizationId,
                            name: SITE_NAME,
                            url: absoluteUrl("/"),
                            logo: absoluteUrl("/icon-512.png"),
                            sameAs: [SITE_REPOSITORY],
                        },
                        {
                            "@type": "WebSite",
                            name: SITE_NAME,
                            description: t("description"),
                            url: absoluteUrl("/"),
                            image: absoluteUrl(OG_IMAGE.url),
                            publisher: { "@id": organizationId },
                        },
                        {
                            // Lets a search engine show the tool list as sitelinks
                            // rather than guessing at the navigation.
                            "@type": "ItemList",
                            name: SITE_NAME,
                            itemListElement: tools.map((tool, index) => ({
                                "@type": "ListItem",
                                position: index + 1,
                                name: tool.name,
                                description: tool.description,
                                url: absoluteUrl(tool.href),
                            })),
                        },
                    ],
                }}
            />

            <div className="flex flex-col gap-12 lg:gap-16">
                <OverviewHero />
                <StatGrid />
                <QuickActions />
                <FeaturedTools />
                <CategoryGrid />
                <RecentTools />
                <OpenSource />
            </div>
        </>
    );
}
