import { IconClock, IconWorld, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { DEFAULT_INPUT_TIME_ZONE, DEFAULT_UNIT } from "@/modules/timestamp/domain/constants";
import {
    getTimestampFaqEntries,
    TimestampArticle,
} from "@/modules/timestamp/components/timestamp-article";
import { TimestampWorkbench } from "@/modules/timestamp/components/timestamp-workbench";
import { TimestampWorkbenchSkeleton } from "@/modules/timestamp/components/timestamp-workbench-skeleton";
import { timestampSearchParamsSchema } from "@/modules/timestamp/validation/timestamp-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/timestamp";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("timestamp.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("timestamp")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TimestampPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function TimestampToolPage({ params, searchParams }: TimestampPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("timestamp.hero"),
        getTranslations("tools"),
        getTimestampFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeFormats"), Icon: IconClock },
        { label: t("badgeZones"), Icon: IconWorld },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("timestamp.name"),
                    description: tTools("timestamp.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("timestamp")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="timestamp"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<TimestampWorkbenchSkeleton />}>
                        <TimestampWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <TimestampArticle />
                </Reveal>

                <RelatedTools toolId="timestamp" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL and the clock. An instant
 * baked into the prerendered shell would be stale for every visitor after the
 * build.
 */
async function TimestampWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = timestampSearchParamsSchema.safeParse(await searchParams);
    // Read once, after the request data (Next refuses the clock in a prerender),
    // and passed down as a prop — so the server-rendered first paint and the
    // hydration pass read the same instant.
    const now = new Date();
    const data = parsed.success ? parsed.data : undefined;

    return (
        <TimestampWorkbench
            initialInput={data?.t ?? ""}
            initialUnit={data?.unit ?? DEFAULT_UNIT}
            initialInputTimeZone={data?.in ?? DEFAULT_INPUT_TIME_ZONE}
            initialPinnedTimeZones={data?.tz ?? []}
            initialNowMs={now.getTime()}
        />
    );
}
