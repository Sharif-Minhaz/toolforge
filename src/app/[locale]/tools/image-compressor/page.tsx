import { IconCpu, IconStack2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageCompressorFaqEntries,
    ImageCompressorArticle,
} from "@/modules/image-compressor/components/image-compressor-article";
import { ImageCompressorWorkbench } from "@/modules/image-compressor/components/image-compressor-workbench";
import { ImageCompressorWorkbenchSkeleton } from "@/modules/image-compressor/components/image-compressor-workbench-skeleton";
import { DEFAULT_OPTIONS, MAX_FILES } from "@/modules/image-compressor/domain/constants";
import { compressionSearchParamsSchema } from "@/modules/image-compressor/validation/compression-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/image-compressor";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("imageCompressor.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-compressor")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ImageCompressorPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ImageCompressorToolPage({
    params,
    searchParams,
}: ImageCompressorPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("imageCompressor.hero"),
        getTranslations("tools"),
        getImageCompressorFaqEntries(),
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
                    name: tTools("image-compressor.name"),
                    description: tTools("image-compressor.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-compressor")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="image-compressor"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ImageCompressorWorkbenchSkeleton />}>
                        <ImageCompressorWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ImageCompressorArticle />
                </Reveal>

                <RelatedTools toolId="image-compressor" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared settings from the
 * URL. Everything around it is prerendered.
 */
async function ImageCompressorWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = compressionSearchParamsSchema.safeParse(await searchParams);
    const initialOptions = {
        quality: (parsed.success ? parsed.data.quality : undefined) ?? DEFAULT_OPTIONS.quality,
        format: (parsed.success ? parsed.data.format : undefined) ?? DEFAULT_OPTIONS.format,
        maxEdge: (parsed.success ? parsed.data.maxEdge : undefined) ?? DEFAULT_OPTIONS.maxEdge,
    };

    return (
        <ImageCompressorWorkbench
            initialOptions={initialOptions}
            // Read on the server, because whether this deployment
            // has a database and a salt is not something the
            // browser can know.
            urlImportEnabled={isRemoteImageImportConfigured()}
        />
    );
}
