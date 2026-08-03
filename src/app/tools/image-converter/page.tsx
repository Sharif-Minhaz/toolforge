import { IconChevronRight, IconCpu, IconStack2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageConverterFaqEntries,
    ImageConverterArticle,
} from "@/modules/image-converter/components/image-converter-article";
import { ImageConverterWorkbench } from "@/modules/image-converter/components/image-converter-workbench";
import { DEFAULT_OPTIONS, MAX_FILES } from "@/modules/image-converter/domain/constants";
import { conversionSearchParamsSchema } from "@/modules/image-converter/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/image-converter";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("imageConverter.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-converter")?.keywords,
    });
}

type ImageConverterPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImageConverterToolPage({ searchParams }: ImageConverterPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("imageConverter.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getImageConverterFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = conversionSearchParamsSchema.safeParse(params);
    const named = parsed.success ? parsed.data : undefined;
    const initialOptions = {
        target: named?.target ?? DEFAULT_OPTIONS.target,
        quality: named?.quality ?? DEFAULT_OPTIONS.quality,
        maxEdge: named?.maxEdge ?? DEFAULT_OPTIONS.maxEdge,
        background: named?.background ?? DEFAULT_OPTIONS.background,
        iconSizes: named?.sizes ?? DEFAULT_OPTIONS.iconSizes,
    };

    const badges = [
        { label: t("badgeCodecs"), Icon: IconCpu },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeBatch", { count: MAX_FILES }), Icon: IconStack2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-converter.name"),
                    description: tTools("image-converter.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-converter")?.keywords,
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
                    <ImageConverterWorkbench initialOptions={initialOptions} />
                </FadeIn>

                <Reveal>
                    <ImageConverterArticle />
                </Reveal>

                <RelatedTools toolId="image-converter" />
            </div>
        </>
    );
}
