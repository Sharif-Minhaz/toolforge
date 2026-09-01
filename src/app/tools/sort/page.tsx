import {
    IconArrowsSort,
    IconChevronRight,
    IconListNumbers,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getSortFaqEntries, SortArticle } from "@/modules/sort/components/sort-article";
import { SortWorkbench } from "@/modules/sort/components/sort-workbench";
import { DEFAULT_SORT_OPTIONS } from "@/modules/sort/domain/constants";
import { drawShuffleSeed } from "@/modules/sort/domain/shuffle";
import { sortSearchParamsSchema } from "@/modules/sort/validation/sort-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/sort";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("sort.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("sort")?.keywords,
    });
}

type SortPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SortToolPage({ searchParams }: SortPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("sort.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getSortFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = sortSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : undefined;

    // Drawn here rather than in the island, so the server-rendered shuffle and
    // the first client render are the same arrangement.
    const seed = drawShuffleSeed(cryptoRandomBytes);

    const badges = [
        { label: t("badgeOrders"), Icon: IconArrowsSort },
        { label: t("badgeSmart"), Icon: IconListNumbers },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("sort.name"),
                    description: tTools("sort.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("sort")?.keywords,
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
                    <SortWorkbench
                        initialText={shared?.text ?? ""}
                        initialOrder={shared?.order ?? DEFAULT_SORT_OPTIONS.order}
                        initialFormat={shared?.format ?? DEFAULT_SORT_OPTIONS.format}
                        initialSplitMode={shared?.split ?? DEFAULT_SORT_OPTIONS.splitMode}
                        initialSeed={seed}
                    />
                </FadeIn>

                <Reveal>
                    <SortArticle />
                </Reveal>

                <RelatedTools toolId="sort" />
            </div>
        </>
    );
}
