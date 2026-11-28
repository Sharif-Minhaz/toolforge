import { IconLanguage, IconRuler2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getLoremFaqEntries, LoremArticle } from "@/modules/lorem/components/lorem-article";
import { LoremWorkbench } from "@/modules/lorem/components/lorem-workbench";
import { LoremWorkbenchSkeleton } from "@/modules/lorem/components/lorem-workbench-skeleton";
import { DEFAULT_LOREM_OPTIONS } from "@/modules/lorem/domain/constants";
import { clampAmount, generateRandomText } from "@/modules/lorem/domain/generate";
import type { LoremOptions } from "@/modules/lorem/types";
import { loremSearchParamsSchema } from "@/modules/lorem/validation/generation-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/lorem";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("lorem.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("lorem")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type LoremPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function LoremToolPage({ params, searchParams }: LoremPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("lorem.hero"),
        getTranslations("tools"),
        getLoremFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeSources"), Icon: IconLanguage },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeExact"), Icon: IconRuler2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("lorem.name"),
                    description: tTools("lorem.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("lorem")?.keywords,
                    faqs,
                })}
            />

            <div className="flex min-w-0 flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="lorem"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<LoremWorkbenchSkeleton />}>
                        <LoremWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <LoremArticle />
                </Reveal>

                <RelatedTools toolId="lorem" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and
 * generates the first draft. Everything around it is prerendered, so a random
 * draft baked into that shell would be handed to every visitor.
 */
async function LoremWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const locale = await getLocale();
    const parsed = loremSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : {};

    const unit = link.unit ?? DEFAULT_LOREM_OPTIONS.unit;
    const options: LoremOptions = {
        source: link.source ?? DEFAULT_LOREM_OPTIONS.source,
        unit,
        // Amount and unit arrive as separate params, so the per-unit ceiling
        // can only be applied once both are known. A link asking for 5000
        // paragraphs opens on 100 rather than a 500.
        amount: clampAmount(unit, link.amount ?? DEFAULT_LOREM_OPTIONS.amount),
        paragraphs: link.paragraphs ?? DEFAULT_LOREM_OPTIONS.paragraphs,
        startWithOpener: link.opener ?? DEFAULT_LOREM_OPTIONS.startWithOpener,
        format: link.format ?? DEFAULT_LOREM_OPTIONS.format,
    };

    // Generated on the server so the very first paint already carries text and
    // hydration has nothing to reconcile.
    const generated = generateRandomText(options);
    const draft = generated.ok
        ? { paragraphs: generated.paragraphs, stats: generated.stats, lang: generated.lang }
        : {
              paragraphs: [],
              stats: { words: 0, characters: 0, sentences: 0, paragraphs: 0 },
              lang: locale,
          };

    return <LoremWorkbench initialOptions={options} initialDraft={draft} />;
}
