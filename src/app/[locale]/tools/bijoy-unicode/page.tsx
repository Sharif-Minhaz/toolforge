import { IconAlphabetBangla, IconArrowsExchange, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { BijoyArticle, getBijoyFaqEntries } from "@/modules/bijoy-unicode/components/bijoy-article";
import { BijoyWorkbench } from "@/modules/bijoy-unicode/components/bijoy-workbench";
import { BijoyWorkbenchSkeleton } from "@/modules/bijoy-unicode/components/bijoy-workbench-skeleton";
import { DEFAULT_BIJOY_DIRECTION } from "@/modules/bijoy-unicode/domain/constants";
import { bijoySearchParamsSchema } from "@/modules/bijoy-unicode/validation/bijoy-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/bijoy-unicode";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("bijoyUnicode.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("bijoy-unicode")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BijoyUnicodePageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function BijoyUnicodeToolPage({
    params,
    searchParams,
}: BijoyUnicodePageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("bijoyUnicode.hero"),
        getTranslations("tools"),
        getBijoyFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeBothWays"), Icon: IconArrowsExchange },
        { label: t("badgeConjuncts"), Icon: IconAlphabetBangla },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("bijoy-unicode.name"),
                    description: tTools("bijoy-unicode.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("bijoy-unicode")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="bijoy-unicode"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<BijoyWorkbenchSkeleton />}>
                        <BijoyWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <BijoyArticle />
                </Reveal>

                <RelatedTools toolId="bijoy-unicode" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the text and direction from the
 * URL. Everything around it is prerendered.
 */
async function BijoyWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = bijoySearchParamsSchema.safeParse(await searchParams);
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const direction = (parsed.success ? parsed.data.to : undefined) ?? DEFAULT_BIJOY_DIRECTION;

    return <BijoyWorkbench initialText={text} initialDirection={direction} />;
}
