import { IconContrast, IconPalette, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { ColorArticle, getColorFaqEntries } from "@/modules/color/components/color-article";
import { ColorWorkbench } from "@/modules/color/components/color-workbench";
import { ColorWorkbenchSkeleton } from "@/modules/color/components/color-workbench-skeleton";
import { DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS } from "@/modules/color/domain/constants";
import { parseColorOrNull } from "@/modules/color/domain/parse";
import { colorSearchParamsSchema } from "@/modules/color/validation/color-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/color";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("color.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("color")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ColorPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ColorToolPage({ params, searchParams }: ColorPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("color.hero"),
        getTranslations("tools"),
        getColorFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeFormats"), Icon: IconPalette },
        { label: t("badgeContrast"), Icon: IconContrast },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("color.name"),
                    description: tTools("color.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("color")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="color"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<ColorWorkbenchSkeleton />}>
                        <ColorWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ColorArticle />
                </Reveal>

                <RelatedTools toolId="color" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared
 * link opens on the colour it names. Everything around it is prerendered.
 */
async function ColorWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = colorSearchParamsSchema.safeParse(await searchParams);
    const requested = parsed.success ? parsed.data.color : undefined;
    // A link naming something that is not a colour opens on the default rather
    // than failing the request.
    const color = (requested === undefined ? null : parseColorOrNull(requested)) ?? DEFAULT_COLOR;

    const options = {
        notation:
            (parsed.success ? parsed.data.notation : undefined) ?? DEFAULT_FORMAT_OPTIONS.notation,
        hexCasing:
            (parsed.success ? parsed.data.hexCase : undefined) ?? DEFAULT_FORMAT_OPTIONS.hexCasing,
    };

    return <ColorWorkbench initialColor={color} initialOptions={options} />;
}
