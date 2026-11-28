import { IconPlayerSkipForward, IconTimeline, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getRefreshRateTesterFaqEntries,
    RefreshRateTesterArticle,
} from "@/modules/refresh-rate-tester/components/refresh-rate-tester-article";
import { RefreshRateTesterWorkbench } from "@/modules/refresh-rate-tester/components/refresh-rate-tester-workbench";
import { RefreshRateTesterWorkbenchSkeleton } from "@/modules/refresh-rate-tester/components/refresh-rate-tester-workbench-skeleton";
import { DEFAULT_MOTION_SPEED } from "@/modules/refresh-rate-tester/domain/constants";
import { refreshRateTesterSearchParamsSchema } from "@/modules/refresh-rate-tester/validation/settings";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/refresh-rate-tester";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("refreshRateTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("refresh-rate-tester")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type RefreshRateTesterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function RefreshRateTesterPage({
    params,
    searchParams,
}: RefreshRateTesterPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("refreshRateTester.hero"),
        getTranslations("tools"),
        getRefreshRateTesterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeFrames"), Icon: IconTimeline },
        { label: t("badgeDrops"), Icon: IconPlayerSkipForward },
        { label: t("badgeLocal"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("refresh-rate-tester.name"),
                    description: tTools("refresh-rate-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("refresh-rate-tester")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="refresh-rate-tester"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<RefreshRateTesterWorkbenchSkeleton />}>
                        <RefreshRateTesterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <RefreshRateTesterArticle />
                </Reveal>

                <RelatedTools toolId="refresh-rate-tester" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the motion speed a shared link
 * names. Everything around it is prerendered.
 */
async function RefreshRateTesterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = refreshRateTesterSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;

    return <RefreshRateTesterWorkbench initialSpeed={shared?.speed ?? DEFAULT_MOTION_SPEED} />;
}
