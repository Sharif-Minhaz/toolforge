import { IconChevronRight, IconTerminal2, IconUserShield, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { ChmodArticle, getChmodFaqEntries } from "@/modules/chmod/components/chmod-article";
import { ChmodWorkbench } from "@/modules/chmod/components/chmod-workbench";
import { ChmodWorkbenchSkeleton } from "@/modules/chmod/components/chmod-workbench-skeleton";
import { DEFAULT_MODE } from "@/modules/chmod/domain/constants";
import { parseMode } from "@/modules/chmod/domain/parse";
import { chmodSearchParamsSchema } from "@/modules/chmod/validation/chmod-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/chmod";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("chmod.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("chmod")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ChmodPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function ChmodToolPage({ params, searchParams }: ChmodPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("chmod.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getChmodFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeGnu"), Icon: IconTerminal2 },
        { label: t("badgeSpecial"), Icon: IconUserShield },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("chmod.name"),
                    description: tTools("chmod.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("chmod")?.keywords,
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
                    <Suspense fallback={<ChmodWorkbenchSkeleton />}>
                        <ChmodWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <ChmodArticle />
                </Reveal>

                <RelatedTools toolId="chmod" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the mode from `?mode=`, octal or
 * symbolic. One that does not parse opens the default rather than an error.
 * Everything around it is prerendered.
 */
async function ChmodWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = chmodSearchParamsSchema.safeParse(await searchParams);
    const requested = parseMode((parsed.success ? parsed.data.mode : undefined) ?? "");

    return <ChmodWorkbench initialMode={requested.ok ? requested.mode : DEFAULT_MODE} />;
}
