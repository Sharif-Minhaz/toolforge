import { IconDeviceDesktopOff, IconStethoscope, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getMouseTesterFaqEntries,
    MouseTesterArticle,
} from "@/modules/mouse-tester/components/mouse-tester-article";
import { MouseTesterModes } from "@/modules/mouse-tester/components/mouse-tester-modes";
import { MouseTesterWorkbenchSkeleton } from "@/modules/mouse-tester/components/mouse-tester-workbench-skeleton";
import {
    DEFAULT_AIM_DURATION,
    DEFAULT_AIM_SCENE,
    DEFAULT_AIM_TARGET_SIZE,
    DEFAULT_FAULT_WINDOW_MS,
} from "@/modules/mouse-tester/domain/constants";
import { mouseTesterSearchParamsSchema } from "@/modules/mouse-tester/validation/settings";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/mouse-tester";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("mouseTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("mouse-tester")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MouseTesterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function MouseTesterPage({ params, searchParams }: MouseTesterPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("mouseTester.hero"),
        getTranslations("tools"),
        getMouseTesterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeCapture"), Icon: IconDeviceDesktopOff },
        { label: t("badgeDiagnosis"), Icon: IconStethoscope },
        { label: t("badgeLocal"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("mouse-tester.name"),
                    description: tTools("mouse-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("mouse-tester")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="mouse-tester"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<MouseTesterWorkbenchSkeleton />}>
                        <MouseTesterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <MouseTesterArticle />
                </Reveal>

                <RelatedTools toolId="mouse-tester" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the mode, fault window and aim
 * settings (size, time, scene) a shared link names. Everything around it is prerendered.
 */
async function MouseTesterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = mouseTesterSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;

    return (
        <MouseTesterModes
            initialMode={shared?.mode ?? "buttons"}
            buttons={{ initialFaultWindow: shared?.window ?? DEFAULT_FAULT_WINDOW_MS }}
            aim={{
                initialSize: shared?.target ?? DEFAULT_AIM_TARGET_SIZE,
                initialDuration: shared?.time ?? DEFAULT_AIM_DURATION,
                initialScene: shared?.scene ?? DEFAULT_AIM_SCENE,
            }}
        />
    );
}
