import { IconCash, IconLanguage, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import {
    getNumberToWordsFaqEntries,
    NumberToWordsArticle,
} from "@/modules/number-to-words/components/number-to-words-article";
import { NumberToWordsWorkbench } from "@/modules/number-to-words/components/number-to-words-workbench";
import { NumberToWordsWorkbenchSkeleton } from "@/modules/number-to-words/components/number-to-words-workbench-skeleton";
import { DEFAULT_NUMBER_WORDS_OPTIONS } from "@/modules/number-to-words/domain/constants";
import { NUMBER_SAMPLE } from "@/modules/number-to-words/domain/samples";
import { numberWordsSearchParamsSchema } from "@/modules/number-to-words/validation/number-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/number-to-words";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("numberToWords.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("number-to-words")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type NumberToWordsPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function NumberToWordsToolPage({
    params,
    searchParams,
}: NumberToWordsPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("numberToWords.hero"),
        getTranslations("tools"),
        getNumberToWordsFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeBilingual"), Icon: IconLanguage },
        { label: t("badgeCheque"), Icon: IconCash },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("number-to-words.name"),
                    description: tTools("number-to-words.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("number-to-words")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="number-to-words"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<NumberToWordsWorkbenchSkeleton />}>
                        <NumberToWordsWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <NumberToWordsArticle />
                </Reveal>

                <RelatedTools toolId="number-to-words" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the number and the options a
 * shared link names. Everything around it is prerendered.
 */
async function NumberToWordsWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = numberWordsSearchParamsSchema.safeParse(await searchParams);
    const query = parsed.success ? parsed.data : {};

    return (
        <NumberToWordsWorkbench
            initialNumber={query.n ?? NUMBER_SAMPLE}
            initialOptions={{
                ...DEFAULT_NUMBER_WORDS_OPTIONS,
                format: query.format ?? DEFAULT_NUMBER_WORDS_OPTIONS.format,
                currency: query.currency ?? DEFAULT_NUMBER_WORDS_OPTIONS.currency,
                scale: query.scale ?? DEFAULT_NUMBER_WORDS_OPTIONS.scale,
            }}
        />
    );
}
