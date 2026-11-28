import { IconKeyboard, IconShieldCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getScreenTesterFaqEntries,
    ScreenTesterArticle,
} from "@/modules/screen-tester/components/screen-tester-article";
import { ScreenTesterWorkbench } from "@/modules/screen-tester/components/screen-tester-workbench";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/screen-tester";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("screenTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("screen-tester")?.keywords,
    });
}

/**
 * Fully prerendered: the workbench takes nothing from the request, so it sits
 * in the static shell rather than behind a Suspense boundary.
 */
export default async function ScreenTesterPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("screenTester.hero"),
        getTranslations("tools"),
        getScreenTesterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeFullscreen"), Icon: IconKeyboard },
        { label: t("badgeSafe"), Icon: IconShieldCheck },
        { label: t("badgeLocal"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("screen-tester.name"),
                    description: tTools("screen-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("screen-tester")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="screen-tester"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <ScreenTesterWorkbench />
                </FadeIn>

                <Reveal>
                    <ScreenTesterArticle />
                </Reveal>

                <RelatedTools toolId="screen-tester" />
            </div>
        </>
    );
}
