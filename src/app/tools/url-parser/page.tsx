import { IconChevronRight, IconPencil, IconWorldOff, IconWorldWww } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

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
import { DEFAULT_URL_PARSER_VIEW } from "@/modules/url-parser/domain/constants";
import { urlParserSearchParamsSchema } from "@/modules/url-parser/validation/url-parser-options";

const TOOL_PATH = "/tools/url-parser";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("urlParser.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("url-parser")?.keywords,
    });
}

type UrlParserPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UrlParserToolPage({ searchParams }: UrlParserPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("urlParser.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getUrlParserFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = urlParserSearchParamsSchema.safeParse(params);
    const url = (parsed.success ? parsed.data.url : undefined) ?? "";
    const view = (parsed.success ? parsed.data.view : undefined) ?? DEFAULT_URL_PARSER_VIEW;

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
                        <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-[1.3] font-medium ring-1 ring-inset"
                            >
                                <Icon
                                    className="text-primary size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <UrlParserWorkbench initialUrl={url} initialView={view} />
                </FadeIn>

                <Reveal>
                    <UrlParserArticle />
                </Reveal>

                <RelatedTools toolId="url-parser" />
            </div>
        </>
    );
}
