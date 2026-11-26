import {
    IconChevronRight,
    IconDeviceDesktopOff,
    IconStethoscope,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getMouseTesterFaqEntries,
    MouseTesterArticle,
} from "@/modules/mouse-tester/components/mouse-tester-article";
import { MouseTesterWorkbench } from "@/modules/mouse-tester/components/mouse-tester-workbench";
import { MouseTesterWorkbenchSkeleton } from "@/modules/mouse-tester/components/mouse-tester-workbench-skeleton";
import { DEFAULT_FAULT_WINDOW_MS } from "@/modules/mouse-tester/domain/constants";
import { mouseTesterSearchParamsSchema } from "@/modules/mouse-tester/validation/settings";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

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
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("mouseTester.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
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
 * The request-time half of the page: reads the fault window a shared
 * link names. Everything around it is prerendered.
 */
async function MouseTesterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = mouseTesterSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : undefined;

    return <MouseTesterWorkbench initialFaultWindow={shared?.window ?? DEFAULT_FAULT_WINDOW_MS} />;
}
