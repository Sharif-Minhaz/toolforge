import { IconChevronRight, IconLink, IconStack2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getSlugFaqEntries, SlugArticle } from "@/modules/slug/components/slug-article";
import { SlugWorkbench } from "@/modules/slug/components/slug-workbench";
import { SlugWorkbenchSkeleton } from "@/modules/slug/components/slug-workbench-skeleton";
import { DEFAULT_SLUG_OPTIONS } from "@/modules/slug/domain/constants";
import { slugSearchParamsSchema } from "@/modules/slug/validation/slug-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/slug";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("slug.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("slug")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SlugPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function SlugToolPage({ params, searchParams }: SlugPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("slug.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getSlugFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeStandard"), Icon: IconLink },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeBulk"), Icon: IconStack2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("slug.name"),
                    description: tTools("slug.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("slug")?.keywords,
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

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
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
                    <Suspense fallback={<SlugWorkbenchSkeleton />}>
                        <SlugWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <SlugArticle />
                </Reveal>

                <RelatedTools toolId="slug" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the text and separator from the URL.
 * Everything around it is prerendered.
 */
async function SlugWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = slugSearchParamsSchema.safeParse(await searchParams);
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const separator =
        (parsed.success ? parsed.data.separator : undefined) ?? DEFAULT_SLUG_OPTIONS.separator;
    const customSeparator =
        (parsed.success ? parsed.data.custom : undefined) ?? DEFAULT_SLUG_OPTIONS.customSeparator;

    return (
        <SlugWorkbench
            initialText={text}
            initialSeparator={separator}
            initialCustomSeparator={customSeparator}
        />
    );
}
