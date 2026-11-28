import { IconCpu, IconStack2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageConverterFaqEntries,
    ImageConverterArticle,
} from "@/modules/image-converter/components/image-converter-article";
import { ImageConverterWorkbench } from "@/modules/image-converter/components/image-converter-workbench";
import { ImageConverterWorkbenchSkeleton } from "@/modules/image-converter/components/image-converter-workbench-skeleton";
import { DEFAULT_OPTIONS, MAX_FILES } from "@/modules/image-converter/domain/constants";
import { conversionSearchParamsSchema } from "@/modules/image-converter/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/image-converter";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("imageConverter.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-converter")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ImageConverterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ImageConverterToolPage({
    params,
    searchParams,
}: ImageConverterPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("imageConverter.hero"),
        getTranslations("tools"),
        getImageConverterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeCodecs"), Icon: IconCpu },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeBatch", { count: MAX_FILES }), Icon: IconStack2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-converter.name"),
                    description: tTools("image-converter.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-converter")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="image-converter"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ImageConverterWorkbenchSkeleton />}>
                        <ImageConverterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ImageConverterArticle />
                </Reveal>

                <RelatedTools toolId="image-converter" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared settings from the
 * URL. Everything around it is prerendered.
 */
async function ImageConverterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = conversionSearchParamsSchema.safeParse(await searchParams);
    const named = parsed.success ? parsed.data : undefined;
    const initialOptions = {
        target: named?.target ?? DEFAULT_OPTIONS.target,
        quality: named?.quality ?? DEFAULT_OPTIONS.quality,
        maxEdge: named?.maxEdge ?? DEFAULT_OPTIONS.maxEdge,
        background: named?.background ?? DEFAULT_OPTIONS.background,
        iconSizes: named?.sizes ?? DEFAULT_OPTIONS.iconSizes,
        colors: named?.colors ?? DEFAULT_OPTIONS.colors,
    };

    return (
        <ImageConverterWorkbench
            initialOptions={initialOptions}
            urlImportEnabled={isRemoteImageImportConfigured()}
        />
    );
}
