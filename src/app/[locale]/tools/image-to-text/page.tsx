import { IconEdit, IconLanguage, IconShieldCheck } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import {
    getImageToTextFaqEntries,
    ImageToTextArticle,
} from "@/modules/image-to-text/components/image-to-text-article";
import { ImageToTextWorkbench } from "@/modules/image-to-text/components/image-to-text-workbench";
import { ImageToTextWorkbenchSkeleton } from "@/modules/image-to-text/components/image-to-text-workbench-skeleton";
import { defaultLanguageForLocale } from "@/modules/image-to-text/domain/languages";
import { ocrSearchParamsSchema } from "@/modules/image-to-text/validation/ocr-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/image-to-text";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("imageToText.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-to-text")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ImageToTextPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ImageToTextToolPage({ params, searchParams }: ImageToTextPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("imageToText.hero"),
        getTranslations("tools"),
        getImageToTextFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLanguages"), Icon: IconLanguage },
        { label: t("badgeLocal"), Icon: IconShieldCheck },
        { label: t("badgeEditable"), Icon: IconEdit },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-to-text.name"),
                    description: tTools("image-to-text.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-to-text")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="image-to-text"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ImageToTextWorkbenchSkeleton />}>
                        <ImageToTextWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ImageToTextArticle />
                </Reveal>

                <RelatedTools toolId="image-to-text" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the `lang` search param and
 * whether URL import is configured. Everything around it is prerendered.
 */
async function ImageToTextWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const [parsed, locale] = await Promise.all([
        searchParams.then((raw) => ocrSearchParamsSchema.safeParse(raw)),
        getLocale(),
    ]);

    return (
        <ImageToTextWorkbench
            initialLanguage={
                (parsed.success ? parsed.data.lang : undefined) ?? defaultLanguageForLocale(locale)
            }
            urlImportEnabled={isRemoteImageImportConfigured()}
        />
    );
}
