import { IconChevronRight, IconPhotoEdit, IconShieldLock, IconSparkles } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import {
    getWatermarkRemoverFaqEntries,
    WatermarkRemoverArticle,
} from "@/modules/watermark-remover/components/watermark-remover-article";
import { WatermarkRemoverWorkbench } from "@/modules/watermark-remover/components/watermark-remover-workbench";

const TOOL_PATH = "/tools/watermark-remover";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("watermarkRemover.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("watermark-remover")?.keywords,
    });
}

export default async function WatermarkRemoverToolPage() {
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("watermarkRemover.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getWatermarkRemoverFaqEntries(),
        getLocale(),
    ]);

    // Read on the server and handed down, so the island never has to reach for
    // `process.env` and an unconfigured deployment says so instead of silently
    // rendering a button that can never work.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const badges = [
        { label: t("badgeModel"), Icon: IconSparkles },
        { label: t("badgeChallenge"), Icon: IconShieldLock },
        { label: t("badgeResolution"), Icon: IconPhotoEdit },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("watermark-remover.name"),
                    description: tTools("watermark-remover.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("watermark-remover")?.keywords,
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
                    <WatermarkRemoverWorkbench siteKey={siteKey} />
                </FadeIn>

                <Reveal>
                    <WatermarkRemoverArticle />
                </Reveal>

                <RelatedTools toolId="watermark-remover" />
            </div>
        </>
    );
}
