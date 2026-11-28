import { IconBinary, IconSearch, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getHexEditorFaqEntries,
    HexEditorArticle,
} from "@/modules/hex-editor/components/hex-editor-article";
import { HexEditorWorkbench } from "@/modules/hex-editor/components/hex-editor-workbench";
import { HexEditorWorkbenchSkeleton } from "@/modules/hex-editor/components/hex-editor-workbench-skeleton";
import {
    DEFAULT_COLUMN,
    DEFAULT_ENDIANNESS,
    DEFAULT_SEARCH_MODE,
} from "@/modules/hex-editor/domain/constants";
import { hexEditorSearchParamsSchema } from "@/modules/hex-editor/validation/hex-editor";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/hex-editor";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("hexEditor.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("hex-editor")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type HexEditorPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function HexEditorPage({ params, searchParams }: HexEditorPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("hexEditor.hero"),
        getTranslations("tools"),
        getHexEditorFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLocal"), Icon: IconWorldOff },
        { label: t("badgeInspector"), Icon: IconBinary },
        { label: t("badgeSearch"), Icon: IconSearch },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("hex-editor.name"),
                    description: tTools("hex-editor.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("hex-editor")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="hex-editor"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<HexEditorWorkbenchSkeleton />}>
                        <HexEditorWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <HexEditorArticle />
                </Reveal>

                <RelatedTools toolId="hex-editor" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the shared settings from the
 * URL. Everything around it is prerendered.
 */
async function HexEditorWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = hexEditorSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;

    return (
        <HexEditorWorkbench
            initialEndian={shared?.endian ?? DEFAULT_ENDIANNESS}
            initialColumn={shared?.column ?? DEFAULT_COLUMN}
            initialSearchMode={shared?.mode ?? DEFAULT_SEARCH_MODE}
        />
    );
}
