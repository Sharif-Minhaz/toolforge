import { IconAspectRatio, IconChevronRight, IconPhoto, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
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
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("webcamTester.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
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
