import { IconMapPin, IconRuler2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { getLandFaqEntries, LandArticle } from "@/modules/land-measurement/components/land-article";
import { LandWorkbench } from "@/modules/land-measurement/components/land-workbench";
import { LandWorkbenchSkeleton } from "@/modules/land-measurement/components/land-workbench-skeleton";
import { DEFAULT_LAND_OPTIONS, LAND_SAMPLE } from "@/modules/land-measurement/domain/constants";
import { landSearchParamsSchema } from "@/modules/land-measurement/validation/land-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/land-measurement";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("landMeasurement.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("land-measurement")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type LandMeasurementPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function LandMeasurementToolPage({
    params,
    searchParams,
}: LandMeasurementPageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("landMeasurement.hero"),
        getTranslations("tools"),
        getLandFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeRegional"), Icon: IconMapPin },
        { label: t("badgeSize"), Icon: IconRuler2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("land-measurement.name"),
                    description: tTools("land-measurement.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("land-measurement")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="land-measurement"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<LandWorkbenchSkeleton />}>
                        <LandWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <LandArticle />
                </Reveal>

                <RelatedTools toolId="land-measurement" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the area, its unit and the district
 * sizes a shared link names. Everything around it is prerendered.
 */
async function LandWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = landSearchParamsSchema.safeParse(await searchParams);
    const query = parsed.success ? parsed.data : {};

    return (
        <LandWorkbench
            initialValue={query.v ?? LAND_SAMPLE}
            initialOptions={{
                unit: query.unit ?? DEFAULT_LAND_OPTIONS.unit,
                bighaRegion: query.bigha ?? DEFAULT_LAND_OPTIONS.bighaRegion,
                kaniRegion: query.kani ?? DEFAULT_LAND_OPTIONS.kaniRegion,
            }}
        />
    );
}
