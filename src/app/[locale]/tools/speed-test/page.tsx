import { IconChartBar, IconClockPause, IconListCheck } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import {
    getSpeedTestFaqEntries,
    SpeedTestArticle,
} from "@/modules/speed-test/components/speed-test-article";
import { SpeedTestWorkbench } from "@/modules/speed-test/components/speed-test-workbench";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/speed-test";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("speedTest.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("speed-test")?.keywords,
    });
}

export default async function SpeedTestToolPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("speedTest.hero"),
        getTranslations("tools"),
        getSpeedTestFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeBloat"), Icon: IconClockPause },
        { label: t("badgeVerdicts"), Icon: IconListCheck },
        { label: t("badgeHistory"), Icon: IconChartBar },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("speed-test.name"),
                    description: tTools("speed-test.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("speed-test")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="speed-test"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    {/* Nothing here depends on the request — a test starts
                        on a press, after the page has loaded — so the island is part of the
                        prerendered shell rather than a streamed section. */}
                    <SpeedTestWorkbench />
                </FadeIn>

                <Reveal>
                    <SpeedTestArticle />
                </Reveal>

                <RelatedTools toolId="speed-test" />
            </div>
        </>
    );
}
