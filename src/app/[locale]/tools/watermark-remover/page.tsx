import {
    IconPhotoEdit,
    IconShieldLock,
    IconPhotoMinus,
    IconVideo,
    IconWand,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import {
    getWatermarkRemoverFaqEntries,
    WatermarkRemoverArticle,
} from "@/modules/watermark-remover/components/watermark-remover-article";
import { WatermarkRemoverWorkbench } from "@/modules/watermark-remover/components/watermark-remover-workbench";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/watermark-remover";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("watermarkRemover.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("watermark-remover")?.keywords,
    });
}

export default async function WatermarkRemoverToolPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("watermarkRemover.hero"),
        getTranslations("tools"),
        getWatermarkRemoverFaqEntries(),
        getLocale(),
    ]);

    // Read on the server and handed down, so the island never has to reach for
    // `process.env` and an unconfigured deployment says so instead of silently
    // rendering a button that can never work.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const badges = [
        { label: t("badgeGemini"), Icon: IconPhotoMinus },
        { label: t("badgeVideo"), Icon: IconVideo },
        { label: t("badgeModel"), Icon: IconWand },
        { label: t("badgeChallenge"), Icon: IconShieldLock },
        { label: t("badgeResolution"), Icon: IconPhotoEdit },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("watermark-remover.name"),
                    description: tTools("watermark-remover.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("watermark-remover")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="watermark-remover"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <WatermarkRemoverWorkbench
                        siteKey={siteKey}
                        urlImportEnabled={isRemoteImageImportConfigured()}
                    />
                </FadeIn>

                <Reveal>
                    <WatermarkRemoverArticle />
                </Reveal>

                <RelatedTools toolId="watermark-remover" />
            </div>
        </>
    );
}
