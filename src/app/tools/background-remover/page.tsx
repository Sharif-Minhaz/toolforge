import { IconChevronRight, IconCpu, IconLayersSubtract, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    BackgroundRemoverArticle,
    getBackgroundRemoverFaqEntries,
} from "@/modules/background-remover/components/background-remover-article";
import { BackgroundRemoverWorkbench } from "@/modules/background-remover/components/background-remover-workbench";
import { DEFAULT_QUALITY } from "@/modules/background-remover/domain/constants";
import { isPhotoSearchConfigured } from "@/modules/background-remover/repository/photo-quota";
import { backgroundRemoverSearchParamsSchema } from "@/modules/background-remover/validation/photo-search";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";

const TOOL_PATH = "/tools/background-remover";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("backgroundRemover.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("background-remover")?.keywords,
    });
}

type BackgroundRemoverPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BackgroundRemoverToolPage({
    searchParams,
}: BackgroundRemoverPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("backgroundRemover.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getBackgroundRemoverFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = backgroundRemoverSearchParamsSchema.safeParse(params);
    const named = parsed.success ? parsed.data : undefined;

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
                        <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
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
                    <BackgroundRemoverWorkbench
                        searchEnabled={isPhotoSearchConfigured()}
                        urlImportEnabled={isRemoteImageImportConfigured()}
                        initialQuality={named?.quality ?? DEFAULT_QUALITY}
                        initialTab={named?.tab ?? "color"}
                        initialQuery={named?.q ?? ""}
                    />
                </FadeIn>

                <Reveal>
                    <BackgroundRemoverArticle />
                </Reveal>

                <RelatedTools toolId="background-remover" />
            </div>
        </>
    );
}
