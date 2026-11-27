import {
    IconCalendarCheck,
    IconCalendarMonth,
    IconChevronRight,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
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
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("ageCalculator.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
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
                <FadeIn className="flex flex-col gap-4">
                    <nav aria-label={tNav("breadcrumb")}>
                        <ol className="text-muted-foreground flex items-center gap-1 text-xs">
                            <li>
                                <Link
                                    href="/"
                                    className="hover:text-foreground focus-visible:ring-ring rounded transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    {tNav("overview")}
                                </Link>
                            </li>
                            <li aria-hidden="true">
                                <IconChevronRight className="size-3.5" stroke={2} />
                            </li>
                            <li className="text-foreground">{t("eyebrow")}</li>
                        </ol>
                    </nav>

                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {t("title")}
                        </h1>
                        <p className="text-muted-foreground text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                            >
                                <Icon className="size-3.5" stroke={1.9} aria-hidden="true" />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

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
