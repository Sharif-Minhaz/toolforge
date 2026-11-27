import { IconChevronRight, IconLayoutGrid, IconLink, IconRuler } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import {
    getLinkPreviewFaqEntries,
    LinkPreviewArticle,
} from "@/modules/link-preview/components/link-preview-article";
import { LinkPreviewWorkbench } from "@/modules/link-preview/components/link-preview-workbench";
import { LinkPreviewWorkbenchSkeleton } from "@/modules/link-preview/components/link-preview-workbench-skeleton";
import { isPreviewQuotaConfigured } from "@/modules/link-preview/repository/quota";
import { linkPreviewSearchParamsSchema } from "@/modules/link-preview/validation/preview-request";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/link-preview";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("linkPreview.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("link-preview")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type LinkPreviewPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function LinkPreviewPage({ params, searchParams }: LinkPreviewPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("linkPreview.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getLinkPreviewFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgePlatforms"), Icon: IconLayoutGrid },
        { label: t("badgeMeasured"), Icon: IconRuler },
        { label: t("badgeSourced"), Icon: IconLink },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("link-preview.name"),
                    description: tTools("link-preview.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("link-preview")?.keywords,
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
                    <Suspense fallback={<LinkPreviewWorkbenchSkeleton />}>
                        <LinkPreviewWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <LinkPreviewArticle />
                </Reveal>

                <RelatedTools toolId="link-preview" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the prefilled address and mode from
 * the URL and whether the fetch quota is configured. Everything around it is
 * prerendered.
 */
async function LinkPreviewWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = linkPreviewSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : undefined;

    return (
        <LinkPreviewWorkbench
            // Prefilled from the link, never run from it: a URL that fetched on
            // arrival would let anybody spend a stranger's allowance, and point
            // this server at a host, by getting them to open it.
            initialUrl={link?.url ?? ""}
            initialMode={link?.mode ?? "fetch"}
            configured={isPreviewQuotaConfigured()}
        />
    );
}
