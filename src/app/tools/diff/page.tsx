import { IconChevronRight, IconFileDiff, IconLetterCase, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { DiffArticle, getDiffFaqEntries } from "@/modules/diff/components/diff-article";
import { DiffWorkbench } from "@/modules/diff/components/diff-workbench";
import { DEFAULT_DIFF_PRECISION, DEFAULT_DIFF_VIEW } from "@/modules/diff/domain/constants";
import { diffSearchParamsSchema } from "@/modules/diff/validation/diff-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/diff";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("diff.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("diff")?.keywords,
    });
}

type DiffPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DiffToolPage({ searchParams }: DiffPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("diff.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getDiffFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = diffSearchParamsSchema.safeParse(params);
    const view = (parsed.success ? parsed.data.view : undefined) ?? DEFAULT_DIFF_VIEW;
    const precision =
        (parsed.success ? parsed.data.precision : undefined) ?? DEFAULT_DIFF_PRECISION;

    const badges = [
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeInline"), Icon: IconLetterCase },
        { label: t("badgePatch"), Icon: IconFileDiff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("diff.name"),
                    description: tTools("diff.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("diff")?.keywords,
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
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-[1.3] font-medium ring-1 ring-inset"
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
                    <DiffWorkbench initialView={view} initialPrecision={precision} />
                </FadeIn>

                <Reveal>
                    <DiffArticle />
                </Reveal>

                <RelatedTools toolId="diff" />
            </div>
        </>
    );
}
