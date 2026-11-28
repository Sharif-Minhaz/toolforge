import { IconCube3dSphere, IconPrinter, IconSparkles } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageTo3dFaqEntries,
    ImageTo3dArticle,
} from "@/modules/image-to-3d/components/image-to-3d-article";
import { ImageTo3dWorkbench } from "@/modules/image-to-3d/components/image-to-3d-workbench";
import { ImageTo3dWorkbenchSkeleton } from "@/modules/image-to-3d/components/image-to-3d-workbench-skeleton";
import { DEFAULT_SETTINGS } from "@/modules/image-to-3d/domain/constants";
import { isObjectDescriberConfigured } from "@/modules/image-to-3d/repository/object-describer";
import { isGenerationQuotaConfigured } from "@/modules/image-to-3d/repository/quota";
import { modelSearchParamsSchema } from "@/modules/image-to-3d/validation/model-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/image-to-3d";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("imageTo3d.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-to-3d")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ImageTo3dPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ImageTo3dToolPage({ params, searchParams }: ImageTo3dPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("imageTo3d.hero"),
        getTranslations("tools"),
        getImageTo3dFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeFormats"), Icon: IconCube3dSphere },
        { label: t("badgeAi"), Icon: IconSparkles },
        { label: t("badgePrintable"), Icon: IconPrinter },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-to-3d.name"),
                    description: tTools("image-to-3d.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-to-3d")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="image-to-3d"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ImageTo3dWorkbenchSkeleton />}>
                        <ImageTo3dWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ImageTo3dArticle />
                </Reveal>

                <RelatedTools toolId="image-to-3d" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared settings from the URL
 * and what this deployment has configured. Everything around it is
 * prerendered.
 */
async function ImageTo3dWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = modelSearchParamsSchema.safeParse(await searchParams);
    const named = parsed.success ? parsed.data : undefined;

    // Resolved here rather than in the island: whether a worker, a key, a salt,
    // a database and a Turnstile secret exist is not something the browser can
    // know, and a button that cannot work is worse than one that says why.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;
    const configured =
        isObjectDescriberConfigured() &&
        isGenerationQuotaConfigured() &&
        Boolean(process.env.TURNSTILE_SECRET);

    return (
        <ImageTo3dWorkbench
            initialDetail={named?.detail ?? DEFAULT_SETTINGS.detail}
            initialFormat={named?.format ?? DEFAULT_SETTINGS.format}
            siteKey={siteKey}
            configured={configured}
            urlImportEnabled={isRemoteImageImportConfigured()}
        />
    );
}
