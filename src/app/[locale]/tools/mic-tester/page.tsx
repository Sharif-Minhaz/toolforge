import { IconChevronRight, IconGauge, IconPlayerRecord, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getMicTesterFaqEntries,
    MicTesterArticle,
} from "@/modules/mic-tester/components/mic-tester-article";
import { MicTesterWorkbench } from "@/modules/mic-tester/components/mic-tester-workbench";
import { MicTesterWorkbenchSkeleton } from "@/modules/mic-tester/components/mic-tester-workbench-skeleton";
import { parseProcessing } from "@/modules/mic-tester/validation/search-params";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/mic-tester";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("micTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("mic-tester")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MicTesterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function MicTesterPage({ params, searchParams }: MicTesterPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("micTester.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getMicTesterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLocal"), Icon: IconWorldOff },
        { label: t("badgeMeter"), Icon: IconGauge },
        { label: t("badgeRecord"), Icon: IconPlayerRecord },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("mic-tester.name"),
                    description: tTools("mic-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("mic-tester")?.keywords,
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
                    <Suspense fallback={<MicTesterWorkbenchSkeleton />}>
                        <MicTesterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <MicTesterArticle />
                </Reveal>

                <RelatedTools toolId="mic-tester" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the processing switches a shared
 * link names. Everything around it is prerendered.
 */
async function MicTesterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    return <MicTesterWorkbench initialProcessing={parseProcessing(await searchParams)} />;
}
