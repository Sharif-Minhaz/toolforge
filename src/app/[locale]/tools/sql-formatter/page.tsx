import { IconDatabase, IconMessage2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
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
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

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
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("sqlFormatter.hero"),
        getTranslations("tools"),
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
                <ToolPageHeader
                    toolId="sql-formatter"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

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
