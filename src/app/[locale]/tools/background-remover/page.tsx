import { IconChevronRight, IconCpu, IconLayersSubtract, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    BackgroundRemoverArticle,
    getBackgroundRemoverFaqEntries,
} from "@/modules/background-remover/components/background-remover-article";
import { BackgroundRemoverWorkbench } from "@/modules/background-remover/components/background-remover-workbench";
import { BackgroundRemoverWorkbenchSkeleton } from "@/modules/background-remover/components/background-remover-workbench-skeleton";
import { isPhotoSearchConfigured } from "@/modules/background-remover/repository/photo-quota";
import { backgroundRemoverSearchParamsSchema } from "@/modules/background-remover/validation/photo-search";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/background-remover";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("backgroundRemover.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("background-remover")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BackgroundRemoverPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function BackgroundRemoverToolPage({
    params,
    searchParams,
}: BackgroundRemoverPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("backgroundRemover.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getBackgroundRemoverFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLocal"), Icon: IconWorldOff },
        { label: t("badgeModel"), Icon: IconCpu },
        { label: t("badgeBackgrounds"), Icon: IconLayersSubtract },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("background-remover.name"),
                    description: tTools("background-remover.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("background-remover")?.keywords,
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
                    <Suspense fallback={<BackgroundRemoverWorkbenchSkeleton />}>
                        <BackgroundRemoverWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <BackgroundRemoverArticle />
                </Reveal>

                <RelatedTools toolId="background-remover" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options and which
 * server-side imports this deployment has configured. Everything around it is
 * prerendered.
 */
async function BackgroundRemoverWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = backgroundRemoverSearchParamsSchema.safeParse(await searchParams);
    const named = parsed.success ? parsed.data : undefined;

    return (
        <BackgroundRemoverWorkbench
            searchEnabled={isPhotoSearchConfigured()}
            urlImportEnabled={isRemoteImageImportConfigured()}
            namedQuality={named?.quality ?? null}
            initialTab={named?.tab ?? "color"}
            initialQuery={named?.q ?? ""}
        />
    );
}
