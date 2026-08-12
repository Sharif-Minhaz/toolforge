import { IconChevronRight, IconPhotoScan, IconShieldLock, IconSparkles } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    AiImageDetectorArticle,
    getAiImageDetectorFaqEntries,
} from "@/modules/ai-image-detector/components/ai-image-detector-article";
import { AiImageDetectorWorkbench } from "@/modules/ai-image-detector/components/ai-image-detector-workbench";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/ai-image-detector";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("aiImageDetector.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("ai-image-detector")?.keywords,
    });
}

export default async function AiImageDetectorToolPage() {
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("aiImageDetector.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getAiImageDetectorFaqEntries(),
        getLocale(),
    ]);

    // Read on the server and handed down, so the island never has to reach for
    // `process.env` and an unconfigured deployment says so instead of silently
    // rendering a button that can never work.
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const badges = [
        { label: t("badgeModel"), Icon: IconSparkles },
        { label: t("badgeChallenge"), Icon: IconShieldLock },
        { label: t("badgeEstimate"), Icon: IconPhotoScan },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("ai-image-detector.name"),
                    description: tTools("ai-image-detector.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("ai-image-detector")?.keywords,
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
                    <AiImageDetectorWorkbench
                        siteKey={siteKey}
                        urlImportEnabled={isRemoteImageImportConfigured()}
                    />
                </FadeIn>

                <Reveal>
                    <AiImageDetectorArticle />
                </Reveal>

                <RelatedTools toolId="ai-image-detector" />
            </div>
        </>
    );
}
