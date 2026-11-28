import { IconCpu, IconRuler2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    BlurPlaceholderArticle,
    getBlurPlaceholderFaqEntries,
} from "@/modules/blur-placeholder/components/blur-placeholder-article";
import { BlurPlaceholderWorkbench } from "@/modules/blur-placeholder/components/blur-placeholder-workbench";
import { BlurPlaceholderWorkbenchSkeleton } from "@/modules/blur-placeholder/components/blur-placeholder-workbench-skeleton";
import { DEFAULT_OPTIONS } from "@/modules/blur-placeholder/domain/constants";
import { placeholderSearchParamsSchema } from "@/modules/blur-placeholder/validation/placeholder-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/blur-placeholder";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("blurPlaceholder.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("blur-placeholder")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BlurPlaceholderPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function BlurPlaceholderToolPage({
    params,
    searchParams,
}: BlurPlaceholderPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("blurPlaceholder.hero"),
        getTranslations("tools"),
        getBlurPlaceholderFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeFormat"), Icon: IconRuler2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeCodec"), Icon: IconCpu },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("blur-placeholder.name"),
                    description: tTools("blur-placeholder.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("blur-placeholder")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="blur-placeholder"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<BlurPlaceholderWorkbenchSkeleton />}>
                        <BlurPlaceholderWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <BlurPlaceholderArticle />
                </Reveal>

                <RelatedTools toolId="blur-placeholder" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and whether
 * URL import is configured. Everything around it is prerendered.
 */
async function BlurPlaceholderWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = placeholderSearchParamsSchema.safeParse(await searchParams);
    const named = parsed.success ? parsed.data : undefined;
    const initialHash = named?.hash ?? "";
    // A link carrying a hash is asking to see that hash, whatever else it says.
    const initialMode = initialHash.length > 0 ? "decode" : (named?.mode ?? "encode");
    const initialOptions = {
        componentX: named?.x ?? DEFAULT_OPTIONS.componentX,
        componentY: named?.y ?? DEFAULT_OPTIONS.componentY,
        punch: named?.punch ?? DEFAULT_OPTIONS.punch,
        edge: named?.edge ?? DEFAULT_OPTIONS.edge,
        ratio: named?.ratio ?? DEFAULT_OPTIONS.ratio,
    };

    return (
        <BlurPlaceholderWorkbench
            urlImportEnabled={isRemoteImageImportConfigured()}
            initialMode={initialMode}
            initialOptions={initialOptions}
            initialHash={initialHash}
        />
    );
}
