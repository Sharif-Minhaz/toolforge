import {
    IconAlphabetBangla,
    IconArrowsExchange,
    IconChevronRight,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { BijoyArticle, getBijoyFaqEntries } from "@/modules/bijoy-unicode/components/bijoy-article";
import { BijoyWorkbench } from "@/modules/bijoy-unicode/components/bijoy-workbench";
import { BijoyWorkbenchSkeleton } from "@/modules/bijoy-unicode/components/bijoy-workbench-skeleton";
import { DEFAULT_BIJOY_DIRECTION } from "@/modules/bijoy-unicode/domain/constants";
import { bijoySearchParamsSchema } from "@/modules/bijoy-unicode/validation/bijoy-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/bijoy-unicode";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("bijoyUnicode.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("bijoy-unicode")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BijoyUnicodePageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function BijoyUnicodeToolPage({
    params,
    searchParams,
}: BijoyUnicodePageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("bijoyUnicode.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getBijoyFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeBothWays"), Icon: IconArrowsExchange },
        { label: t("badgeConjuncts"), Icon: IconAlphabetBangla },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("bijoy-unicode.name"),
                    description: tTools("bijoy-unicode.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("bijoy-unicode")?.keywords,
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
                    <Suspense fallback={<BijoyWorkbenchSkeleton />}>
                        <BijoyWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <BijoyArticle />
                </Reveal>

                <RelatedTools toolId="bijoy-unicode" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the text and direction from the
 * URL. Everything around it is prerendered.
 */
async function BijoyWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = bijoySearchParamsSchema.safeParse(await searchParams);
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const direction = (parsed.success ? parsed.data.to : undefined) ?? DEFAULT_BIJOY_DIRECTION;

    return <BijoyWorkbench initialText={text} initialDirection={direction} />;
}
