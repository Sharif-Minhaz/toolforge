import { IconPhotoOff, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    FaviconGeneratorArticle,
    getFaviconGeneratorFaqEntries,
} from "@/modules/favicon-generator/components/favicon-generator-article";
import { FaviconGeneratorWorkbench } from "@/modules/favicon-generator/components/favicon-generator-workbench";
import { FaviconGeneratorWorkbenchSkeleton } from "@/modules/favicon-generator/components/favicon-generator-workbench-skeleton";
import { initialOptionsFrom } from "@/modules/favicon-generator/validation/search-params";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/favicon-generator";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("faviconGenerator.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("favicon-generator")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type FaviconGeneratorPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function FaviconGeneratorToolPage({
    params,
    searchParams,
}: FaviconGeneratorPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("faviconGenerator.hero"),
        getTranslations("tools"),
        getFaviconGeneratorFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeNoImage"), Icon: IconPhotoOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("favicon-generator.name"),
                    description: tTools("favicon-generator.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("favicon-generator")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="favicon-generator"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<FaviconGeneratorWorkbenchSkeleton />}>
                        <FaviconGeneratorWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <FaviconGeneratorArticle />
                </Reveal>

                <RelatedTools toolId="favicon-generator" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the text and colours a shared link
 * names. Everything around it is prerendered.
 */
async function FaviconGeneratorWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    return <FaviconGeneratorWorkbench initialOptions={initialOptionsFrom(await searchParams)} />;
}
