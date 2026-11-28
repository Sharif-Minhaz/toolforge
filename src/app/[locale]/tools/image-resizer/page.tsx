import { IconCpu, IconId, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageResizerFaqEntries,
    ImageResizerArticle,
} from "@/modules/image-resizer/components/image-resizer-article";
import { ImageResizerWorkbench } from "@/modules/image-resizer/components/image-resizer-workbench";
import { ImageResizerWorkbenchSkeleton } from "@/modules/image-resizer/components/image-resizer-workbench-skeleton";
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_OPTIONS,
} from "@/modules/image-resizer/domain/constants";
import { findPreset, presetDpi } from "@/modules/image-resizer/domain/presets";
import type { ResizeOptions } from "@/modules/image-resizer/types";
import { resizeSearchParamsSchema } from "@/modules/image-resizer/validation/resize-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/image-resizer";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("imageResizer.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-resizer")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ImageResizerPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ImageResizerToolPage({
    params,
    searchParams,
}: ImageResizerPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("imageResizer.hero"),
        getTranslations("tools"),
        getImageResizerFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeCodecs"), Icon: IconCpu },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgePassport"), Icon: IconId },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-resizer.name"),
                    description: tTools("image-resizer.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-resizer")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="image-resizer"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ImageResizerWorkbenchSkeleton />}>
                        <ImageResizerWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ImageResizerArticle />
                </Reveal>

                <RelatedTools toolId="image-resizer" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared settings from the
 * URL. Everything around it is prerendered.
 */
async function ImageResizerWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = resizeSearchParamsSchema.safeParse(await searchParams);
    const query = parsed.success ? parsed.data : {};
    const presetId = query.preset ?? DEFAULT_OPTIONS.presetId;
    const preset = findPreset(presetId);

    const initialOptions: ResizeOptions = {
        ...DEFAULT_OPTIONS,
        // A link that names a preset means the preset mode, even when it left
        // `mode` out — the alternative is a link that silently ignores half of
        // itself.
        mode: query.mode ?? (query.preset === undefined ? DEFAULT_OPTIONS.mode : "preset"),
        width: query.w ?? DEFAULT_OPTIONS.width,
        height: query.h ?? DEFAULT_OPTIONS.height,
        unit: query.unit ?? DEFAULT_OPTIONS.unit,
        // The preset's own resolution wins over the default but not over one
        // the link asked for.
        dpi: query.dpi ?? (preset === null ? null : presetDpi(preset.size)) ?? DEFAULT_OPTIONS.dpi,
        percentage: query.percent ?? DEFAULT_OPTIONS.percentage,
        presetId,
        fit: query.fit ?? preset?.fit ?? DEFAULT_OPTIONS.fit,
        zoom: query.zoom ?? DEFAULT_OPTIONS.zoom,
        format: query.format ?? DEFAULT_OPTIONS.format,
        quality: query.quality ?? DEFAULT_OPTIONS.quality,
        backgroundColor: query.bg ?? DEFAULT_BACKGROUND_COLOR,
    };

    return (
        <ImageResizerWorkbench
            initialOptions={initialOptions}
            // Read on the server, because whether this deployment has
            // a database and a salt is not something the browser can
            // know — and a control that cannot work is worse than an
            // absent one.
            urlImportEnabled={isRemoteImageImportConfigured()}
        />
    );
}
