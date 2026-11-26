import { IconChevronRight, IconDatabase, IconMessage2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import {
    getSqlFormatterFaqEntries,
    SqlFormatterArticle,
} from "@/modules/sql-formatter/components/sql-formatter-article";
import { SqlFormatterWorkbench } from "@/modules/sql-formatter/components/sql-formatter-workbench";
import { SqlFormatterWorkbenchSkeleton } from "@/modules/sql-formatter/components/sql-formatter-workbench-skeleton";
import { DEFAULT_SQL_FORMAT_OPTIONS } from "@/modules/sql-formatter/domain/constants";
import type { SqlFormatOptions } from "@/modules/sql-formatter/types";
import { sqlFormatterSearchParamsSchema } from "@/modules/sql-formatter/validation/format-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/sql-formatter";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("sqlFormatter.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("sql-formatter")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SqlFormatterPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function SqlFormatterToolPage({
    params,
    searchParams,
}: SqlFormatterPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("sqlFormatter.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getSqlFormatterFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeDialects"), Icon: IconDatabase },
        { label: t("badgeComments"), Icon: IconMessage2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("sql-formatter.name"),
                    description: tTools("sql-formatter.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("sql-formatter")?.keywords,
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
                    <Suspense fallback={<SqlFormatterWorkbenchSkeleton />}>
                        <SqlFormatterWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <SqlFormatterArticle />
                </Reveal>

                <RelatedTools toolId="sql-formatter" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads a shared query and its settings
 * from the URL. Everything around it is prerendered.
 */
async function SqlFormatterWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = sqlFormatterSearchParamsSchema.safeParse(await searchParams);
    const shared = parsed.success ? parsed.data : {};

    const options: SqlFormatOptions = {
        dialect: shared.dialect ?? DEFAULT_SQL_FORMAT_OPTIONS.dialect,
        keywordCase: shared.keywordCase ?? DEFAULT_SQL_FORMAT_OPTIONS.keywordCase,
        indent: shared.indent ?? DEFAULT_SQL_FORMAT_OPTIONS.indent,
        linesBetweenQueries: shared.lines ?? DEFAULT_SQL_FORMAT_OPTIONS.linesBetweenQueries,
    };

    return <SqlFormatterWorkbench initialText={shared.sql ?? ""} initialOptions={options} />;
}
