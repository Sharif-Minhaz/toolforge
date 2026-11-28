import { IconChartDots3, IconMath, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getMarkdownFaqEntries,
    MarkdownArticle,
} from "@/modules/markdown/components/markdown-article";
import { MarkdownWorkbench } from "@/modules/markdown/components/markdown-workbench";
import { MarkdownWorkbenchSkeleton } from "@/modules/markdown/components/markdown-workbench-skeleton";
import { DEFAULT_MARKDOWN_VIEW, DEFAULT_SYNC_SCROLL } from "@/modules/markdown/domain/constants";
import { markdownSearchParamsSchema } from "@/modules/markdown/validation/preview-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/markdown";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("markdown.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("markdown")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MarkdownPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function MarkdownToolPage({ params, searchParams }: MarkdownPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("markdown.hero"),
        getTranslations("tools"),
        getMarkdownFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeDiagrams"), Icon: IconChartDots3 },
        { label: t("badgeMath"), Icon: IconMath },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("markdown.name"),
                    description: tTools("markdown.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("markdown")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="markdown"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<MarkdownWorkbenchSkeleton />}>
                        <MarkdownWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <MarkdownArticle />
                </Reveal>

                <RelatedTools toolId="markdown" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the view, sync and shared
 * document from the URL. Everything around it is prerendered.
 */
async function MarkdownWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const tSample = await getTranslations("markdown.sample");
    const parsed = markdownSearchParamsSchema.safeParse(await searchParams);
    const view = (parsed.success ? parsed.data.view : undefined) ?? DEFAULT_MARKDOWN_VIEW;
    const syncScroll = (parsed.success ? parsed.data.sync : undefined) ?? DEFAULT_SYNC_SCROLL;
    const shared = parsed.success ? parsed.data.text : undefined;
    // The starter document is localised copy, so it is resolved here and handed
    // down; the island only ever sees a string.
    const sample = tSample("document");

    return (
        <MarkdownWorkbench
            initialText={shared ?? sample}
            initialView={view}
            initialSyncScroll={syncScroll}
            sampleDocument={sample}
        />
    );
}
