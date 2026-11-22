import { IconChevronRight, IconClock, IconWorld, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { CronArticle, getCronFaqEntries } from "@/modules/cron/components/cron-article";
import { CronWorkbench } from "@/modules/cron/components/cron-workbench";
import { CronWorkbenchSkeleton } from "@/modules/cron/components/cron-workbench-skeleton";
import {
    DEFAULT_EXPRESSION,
    DEFAULT_RUN_COUNT,
    DEFAULT_TIME_ZONE,
    DEFAULT_WEEKDAY_BASE,
} from "@/modules/cron/domain/constants";
import { cronSearchParamsSchema } from "@/modules/cron/validation/cron-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/cron";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("cron.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("cron")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type CronPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function CronToolPage({ params, searchParams }: CronPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("cron.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getCronFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeQuartz"), Icon: IconClock },
        { label: t("badgeZones"), Icon: IconWorld },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("cron.name"),
                    description: tTools("cron.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("cron")?.keywords,
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
                        <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-[1.3] font-medium ring-1 ring-inset"
                            >
                                <Icon
                                    className="text-primary size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <Suspense fallback={<CronWorkbenchSkeleton />}>
                        <CronWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <CronArticle />
                </Reveal>

                <RelatedTools toolId="cron" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and the clock.
 * Everything around it is prerendered — a `now` baked into that shell would list
 * run times that are already in the past.
 */
async function CronWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = cronSearchParamsSchema.safeParse(await searchParams);
    // Read once, after the request data (Next refuses the clock in a prerender),
    // and passed down as a prop — so the server-rendered first paint and the
    // hydration pass work out the same run times.
    const now = new Date();
    const data = parsed.success ? parsed.data : undefined;

    return (
        <CronWorkbench
            initialExpression={data?.expr ?? DEFAULT_EXPRESSION}
            initialTimeZone={data?.tz ?? DEFAULT_TIME_ZONE}
            initialWeekdayBase={data?.base ?? DEFAULT_WEEKDAY_BASE}
            initialRunCount={data?.runs ?? DEFAULT_RUN_COUNT}
            initialNowMs={now.getTime()}
        />
    );
}
