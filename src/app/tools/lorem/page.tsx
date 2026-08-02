import { IconChevronRight, IconLanguage, IconSparkles, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getLoremFaqEntries, LoremArticle } from "@/modules/lorem/components/lorem-article";
import { LoremWorkbench } from "@/modules/lorem/components/lorem-workbench";
import { DEFAULT_LOREM_OPTIONS } from "@/modules/lorem/domain/constants";
import { clampAmount, generateRandomText } from "@/modules/lorem/domain/generate";
import type { LoremOptions } from "@/modules/lorem/types";
import { loremSearchParamsSchema } from "@/modules/lorem/validation/generation-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/lorem";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("lorem.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("lorem")?.keywords,
    });
}

type LoremPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoremToolPage({ searchParams }: LoremPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("lorem.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getLoremFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = loremSearchParamsSchema.safeParse(params);
    const link = parsed.success ? parsed.data : {};

    const unit = link.unit ?? DEFAULT_LOREM_OPTIONS.unit;
    const options: LoremOptions = {
        source: link.source ?? DEFAULT_LOREM_OPTIONS.source,
        unit,
        // Amount and unit arrive as separate params, so the per-unit ceiling
        // can only be applied once both are known. A link asking for 5000
        // paragraphs opens on 100 rather than a 500.
        amount: clampAmount(unit, link.amount ?? DEFAULT_LOREM_OPTIONS.amount),
        paragraphs: link.paragraphs ?? DEFAULT_LOREM_OPTIONS.paragraphs,
        startWithOpener: link.opener ?? DEFAULT_LOREM_OPTIONS.startWithOpener,
        format: link.format ?? DEFAULT_LOREM_OPTIONS.format,
    };

    // Generated on the server so the very first paint already carries text and
    // hydration has nothing to reconcile.
    const generated = generateRandomText(options);
    const draft = generated.ok
        ? { paragraphs: generated.paragraphs, stats: generated.stats, lang: generated.lang }
        : {
              paragraphs: [],
              stats: { words: 0, characters: 0, sentences: 0, paragraphs: 0 },
              lang: locale,
          };

    const badges = [
        { label: t("badgeSources"), Icon: IconLanguage },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeExact"), Icon: IconSparkles },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("lorem.name"),
                    description: tTools("lorem.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("lorem")?.keywords,
                    faqs,
                })}
            />

            <div className="flex min-w-0 flex-col gap-10 lg:gap-12">
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
                    <LoremWorkbench initialOptions={options} initialDraft={draft} />
                </FadeIn>

                <Reveal>
                    <LoremArticle />
                </Reveal>

                <RelatedTools toolId="lorem" />
            </div>
        </>
    );
}
