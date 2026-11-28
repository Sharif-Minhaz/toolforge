import { IconFileDiff, IconLetterCase, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { DiffArticle, getDiffFaqEntries } from "@/modules/diff/components/diff-article";
import { DiffWorkbench } from "@/modules/diff/components/diff-workbench";
import { DiffWorkbenchSkeleton } from "@/modules/diff/components/diff-workbench-skeleton";
import { DEFAULT_DIFF_PRECISION, DEFAULT_DIFF_VIEW } from "@/modules/diff/domain/constants";
import { diffSearchParamsSchema } from "@/modules/diff/validation/diff-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/diff";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("diff.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("diff")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type DiffPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function DiffToolPage({ params, searchParams }: DiffPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("diff.hero"),
        getTranslations("tools"),
        getDiffFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeInline"), Icon: IconLetterCase },
        { label: t("badgePatch"), Icon: IconFileDiff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("diff.name"),
                    description: tTools("diff.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("diff")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="diff"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<DiffWorkbenchSkeleton />}>
                        <DiffWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <DiffArticle />
                </Reveal>

                <RelatedTools toolId="diff" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared
 * link opens on the view it names. Everything around it is prerendered.
 */
async function DiffWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = diffSearchParamsSchema.safeParse(await searchParams);
    const view = (parsed.success ? parsed.data.view : undefined) ?? DEFAULT_DIFF_VIEW;
    const precision =
        (parsed.success ? parsed.data.precision : undefined) ?? DEFAULT_DIFF_PRECISION;

    return <DiffWorkbench initialView={view} initialPrecision={precision} />;
}
