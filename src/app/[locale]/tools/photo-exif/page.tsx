import { IconMapPinOff, IconPhotoCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import {
    getPhotoExifFaqEntries,
    PhotoExifArticle,
} from "@/modules/photo-exif/components/photo-exif-article";
import { PhotoExifWorkbench } from "@/modules/photo-exif/components/photo-exif-workbench";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/photo-exif";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("photoExif.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("photo-exif")?.keywords,
    });
}

export default async function PhotoExifToolPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("photoExif.hero"),
        getTranslations("tools"),
        getPhotoExifFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLossless"), Icon: IconPhotoCheck },
        { label: t("badgePrivacy"), Icon: IconMapPinOff },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("photo-exif.name"),
                    description: tTools("photo-exif.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("photo-exif")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="photo-exif"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    {/* Nothing here depends on the request — the photo arrives
                        after the page has loaded — so the island is part of the
                        prerendered shell rather than a streamed section. */}
                    <PhotoExifWorkbench />
                </FadeIn>

                <Reveal>
                    <PhotoExifArticle />
                </Reveal>

                <RelatedTools toolId="photo-exif" />
            </div>
        </>
    );
}
