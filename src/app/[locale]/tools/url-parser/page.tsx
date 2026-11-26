import { IconChevronRight, IconPencil, IconWorldOff, IconWorldWww } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
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
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("urlParser.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
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
                <FadeIn className="flex flex-col gap-4">
                    <nav aria-label={tNav("breadcrumb")}>
                        <ol className="text-muted-foreground flex items-center gap-1 text-xs">
                            <li>
                                <Link
                                    href="/"
                                    className="hover:text-foreground focus-visible:ring-ring rounded transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    {tNav("overview")}
                                </Link>
                            </li>
                            <li aria-hidden="true">
                                <IconChevronRight className="size-3.5" stroke={2} />
                            </li>
                            <li className="text-foreground">{t("eyebrow")}</li>
                        </ol>
                    </nav>

                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {t("title")}
                        </h1>
                        <p className="text-muted-foreground text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                            >
                                <Icon className="size-3.5" stroke={1.9} aria-hidden="true" />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

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
