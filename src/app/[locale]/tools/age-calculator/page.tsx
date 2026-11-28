import { IconCalendarCheck, IconCalendarMonth, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { AgeArticle, getAgeFaqEntries } from "@/modules/age-calculator/components/age-article";
import { AgeWorkbench } from "@/modules/age-calculator/components/age-workbench";
import { AgeWorkbenchSkeleton } from "@/modules/age-calculator/components/age-workbench-skeleton";
import { buildInitialState } from "@/modules/age-calculator/domain/initial-state";
import { todayInBangladesh } from "@/modules/age-calculator/domain/today";
import { ageSearchParamsSchema } from "@/modules/age-calculator/validation/age-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/age-calculator";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("ageCalculator.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("age-calculator")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type AgeCalculatorPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function AgeCalculatorToolPage({
    params,
    searchParams,
}: AgeCalculatorPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("ageCalculator.hero"),
        getTranslations("tools"),
        getAgeFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeCircular"), Icon: IconCalendarCheck },
        { label: t("badgeBangla"), Icon: IconCalendarMonth },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("age-calculator.name"),
                    description: tTools("age-calculator.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("age-calculator")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="age-calculator"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<AgeWorkbenchSkeleton />}>
                        <AgeWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <AgeArticle />
                </Reveal>

                <RelatedTools toolId="age-calculator" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL and the clock. "Today" is
 * the hard part of this tool — read here, once, after the request data (Next
 * refuses the clock in a prerender), as Bangladesh's date, and passed down as a
 * prop. A clock read in the island would be the reader's zone on one side of
 * hydration and the server's on the other, and a date baked into the
 * prerendered shell would be stale for everybody after the build.
 */
async function AgeWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = ageSearchParamsSchema.safeParse(await searchParams);
    // Read once, after the request data, the way the timestamp page does.
    const now = new Date();
    const today = todayInBangladesh(now.getTime());
    const state = buildInitialState(parsed.success ? parsed.data : {}, today);

    return (
        <AgeWorkbench
            today={today}
            initialMode={state.mode}
            initialAgeFields={state.ageFields}
            initialConvertFields={state.convertFields}
            initialHijriAdjustment={state.hijriAdjustment}
        />
    );
}
