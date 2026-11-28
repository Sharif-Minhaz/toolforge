import { IconAspectRatio, IconPhoto, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import {
    getWebcamTesterFaqEntries,
    WebcamTesterArticle,
} from "@/modules/webcam-tester/components/webcam-tester-article";
import { WebcamTesterWorkbench } from "@/modules/webcam-tester/components/webcam-tester-workbench";
import { WebcamTesterWorkbenchSkeleton } from "@/modules/webcam-tester/components/webcam-tester-workbench-skeleton";
import { DEFAULT_MIRROR, DEFAULT_RESOLUTION_PRESET } from "@/modules/webcam-tester/domain/video";
import { webcamTesterSearchParamsSchema } from "@/modules/webcam-tester/validation/search-params";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/webcam-tester";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("webcamTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("webcam-tester")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type WebcamTesterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function WebcamTesterPage({ params, searchParams }: WebcamTesterPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("webcamTester.hero"),
        getTranslations("tools"),
        getWebcamTesterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLocal"), Icon: IconWorldOff },
        { label: t("badgeReport"), Icon: IconAspectRatio },
        { label: t("badgeSnapshot"), Icon: IconPhoto },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("webcam-tester.name"),
                    description: tTools("webcam-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("webcam-tester")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="webcam-tester"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<WebcamTesterWorkbenchSkeleton />}>
                        <WebcamTesterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <WebcamTesterArticle />
                </Reveal>

                <RelatedTools toolId="webcam-tester" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the size and mirror setting a
 * shared link names. Everything around it is prerendered.
 */
async function WebcamTesterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = webcamTesterSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;
    const mirror = shared?.mirror === undefined ? DEFAULT_MIRROR : shared.mirror === "on";

    return (
        <WebcamTesterWorkbench
            initialPreset={shared?.resolution ?? DEFAULT_RESOLUTION_PRESET}
            initialMirror={mirror}
        />
    );
}
