import { getTranslations } from "next-intl/server";

import { CategoryGrid } from "@/modules/overview/components/category-grid";
import { FeaturedTools } from "@/modules/overview/components/featured-tools";
import { OverviewHero } from "@/modules/overview/components/overview-hero";
import { QuickActions } from "@/modules/overview/components/quick-actions";
import { RecentTools } from "@/modules/overview/components/recent-tools";
import { StatGrid } from "@/modules/overview/components/stat-grid";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { absoluteUrl, SITE_NAME } from "@/modules/seo/domain/site";

export default async function OverviewPage() {
    const t = await getTranslations("app");

    return (
        <>
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@type": "WebSite",
                    name: SITE_NAME,
                    description: t("description"),
                    url: absoluteUrl("/"),
                    publisher: { "@type": "Organization", name: SITE_NAME },
                }}
            />

            <div className="flex flex-col gap-12 lg:gap-16">
                <OverviewHero />
                <StatGrid />
                <QuickActions />
                <FeaturedTools />
                <CategoryGrid />
                <RecentTools />
            </div>
        </>
    );
}
