import { IconArrowsSort, IconListNumbers, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getSortFaqEntries, SortArticle } from "@/modules/sort/components/sort-article";
import { SortWorkbench } from "@/modules/sort/components/sort-workbench";
import { SortWorkbenchSkeleton } from "@/modules/sort/components/sort-workbench-skeleton";
import { DEFAULT_SORT_OPTIONS } from "@/modules/sort/domain/constants";
import { drawShuffleSeed } from "@/modules/sort/domain/shuffle";
import { sortSearchParamsSchema } from "@/modules/sort/validation/sort-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/sort";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("sort.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("sort")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SortPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function SortToolPage({ params, searchParams }: SortPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("sort.hero"),
        getTranslations("tools"),
        getSortFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeOrders"), Icon: IconArrowsSort },
        { label: t("badgeSmart"), Icon: IconListNumbers },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("sort.name"),
                    description: tTools("sort.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("sort")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="sort"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<SortWorkbenchSkeleton />}>
                        <SortWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <SortArticle />
                </Reveal>

                <RelatedTools toolId="sort" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared list from the URL and
 * draws the shuffle seed. A seed baked into the prerendered shell would hand
 * every visitor the same shuffle.
 */
async function SortWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = sortSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;

    // Drawn here rather than in the island, so the server-rendered shuffle and
    // the first client render are the same arrangement.
    const seed = drawShuffleSeed(cryptoRandomBytes);

    return (
        <SortWorkbench
            initialText={shared?.text ?? ""}
            initialOrder={shared?.order ?? DEFAULT_SORT_OPTIONS.order}
            initialFormat={shared?.format ?? DEFAULT_SORT_OPTIONS.format}
            initialSplitMode={shared?.split ?? DEFAULT_SORT_OPTIONS.splitMode}
            initialSeed={seed}
        />
    );
}
