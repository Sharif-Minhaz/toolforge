import { IconCalendarTime, IconListTree, IconSitemap } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import {
    getSubdomainLookupFaqEntries,
    SubdomainLookupArticle,
} from "@/modules/subdomain-lookup/components/subdomain-lookup-article";
import { SubdomainLookupWorkbench } from "@/modules/subdomain-lookup/components/subdomain-lookup-workbench";
import { SubdomainLookupWorkbenchSkeleton } from "@/modules/subdomain-lookup/components/subdomain-lookup-workbench-skeleton";
import { isLookupQuotaConfigured } from "@/modules/subdomain-lookup/repository/quota";
import { subdomainLookupSearchParamsSchema } from "@/modules/subdomain-lookup/validation/lookup-request";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/subdomain-lookup";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("subdomainLookup.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("subdomain-lookup")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SubdomainLookupPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function SubdomainLookupPage({
    params,
    searchParams,
}: SubdomainLookupPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("subdomainLookup.hero"),
        getTranslations("tools"),
        getSubdomainLookupFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeSource"), Icon: IconSitemap },
        { label: t("badgeDates"), Icon: IconCalendarTime },
        { label: t("badgeLarge"), Icon: IconListTree },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("subdomain-lookup.name"),
                    description: tTools("subdomain-lookup.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("subdomain-lookup")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="subdomain-lookup"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<SubdomainLookupWorkbenchSkeleton />}>
                        <SubdomainLookupWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <SubdomainLookupArticle />
                </Reveal>

                <RelatedTools toolId="subdomain-lookup" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the prefilled apex from the URL and
 * whether the lookup quota is configured. Everything around it is prerendered.
 */
async function SubdomainLookupWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = subdomainLookupSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : undefined;

    return (
        <SubdomainLookupWorkbench
            // Prefilled from the link, never run from it: a URL that
            // queried on arrival would let anybody spend a stranger's
            // allowance by getting them to open it.
            initialApex={link?.apex ?? ""}
            initialSort={link?.sort ?? "hierarchy"}
            configured={isLookupQuotaConfigured()}
        />
    );
}
