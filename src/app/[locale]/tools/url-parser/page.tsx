import { IconPencil, IconWorldOff, IconWorldWww } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import {
    getUrlParserFaqEntries,
    UrlParserArticle,
} from "@/modules/url-parser/components/url-parser-article";
import { UrlParserWorkbench } from "@/modules/url-parser/components/url-parser-workbench";
import { UrlParserWorkbenchSkeleton } from "@/modules/url-parser/components/url-parser-workbench-skeleton";
import { DEFAULT_URL_PARSER_VIEW } from "@/modules/url-parser/domain/constants";
import { urlParserSearchParamsSchema } from "@/modules/url-parser/validation/url-parser-options";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/url-parser";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("urlParser.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("url-parser")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type UrlParserPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function UrlParserToolPage({ params, searchParams }: UrlParserPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("urlParser.hero"),
        getTranslations("tools"),
        getUrlParserFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeStandard"), Icon: IconWorldWww },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeEditable"), Icon: IconPencil },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("url-parser.name"),
                    description: tTools("url-parser.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("url-parser")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="url-parser"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<UrlParserWorkbenchSkeleton />}>
                        <UrlParserWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <UrlParserArticle />
                </Reveal>

                <RelatedTools toolId="url-parser" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL to parse and the view from
 * the search params. Everything around it is prerendered.
 */
async function UrlParserWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = urlParserSearchParamsSchema.safeParse(await searchParams);
    const url = (parsed.success ? parsed.data.url : undefined) ?? "";
    const view = (parsed.success ? parsed.data.view : undefined) ?? DEFAULT_URL_PARSER_VIEW;

    return <UrlParserWorkbench initialUrl={url} initialView={view} />;
}
