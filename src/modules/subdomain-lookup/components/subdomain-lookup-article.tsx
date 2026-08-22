import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

import {
    MAX_RECORDS,
    MAX_RESPONSE_BYTES,
    PAGE_SIZE,
    QUOTA_LIMIT_PER_ADDRESS,
    QUOTA_LIMIT_PER_DEPLOYMENT,
} from "../domain/constants";
import { SUBDOMAIN_SORTS } from "../types";

export const SUBDOMAIN_LOOKUP_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "source", titleKey: "source.title" },
    { id: "reading", titleKey: "reading.title" },
    { id: "options", titleKey: "options.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Each figure above the table, and the sentence explaining it. */
const READING_ROWS = [
    { id: "total", nameKey: "totalName", meansKey: "totalMeans" },
    { id: "recent", nameKey: "recentName", meansKey: "recentMeans" },
    { id: "depth", nameKey: "depthName", meansKey: "depthMeans" },
    { id: "dated", nameKey: "datedName", meansKey: "datedMeans" },
] as const;

/** Every control on the tool. Adding one here is part of adding it to the page. */
const OPTION_ROWS = [
    { id: "domain", nameKey: "domainName", doesKey: "domainDoes", whenKey: "domainWhen" },
    { id: "filter", nameKey: "filterName", doesKey: "filterDoes", whenKey: "filterWhen" },
    { id: "sort", nameKey: "sortName", doesKey: "sortDoes", whenKey: "sortWhen" },
    { id: "export", nameKey: "exportName", doesKey: "exportDoes", whenKey: "exportWhen" },
] as const;

/**
 * The limits table reads its numbers from the constants the tool runs on, so
 * the article cannot claim a ceiling the code does not enforce.
 */
const LIMIT_ROWS = [
    {
        id: "perVisitor",
        labelKey: "perVisitor",
        whyKey: "perVisitorWhy",
        value: `${QUOTA_LIMIT_PER_ADDRESS} / hour`,
    },
    {
        id: "perSite",
        labelKey: "perSite",
        whyKey: "perSiteWhy",
        value: `${QUOTA_LIMIT_PER_DEPLOYMENT} / hour`,
    },
    {
        id: "responseSize",
        labelKey: "responseSize",
        whyKey: "responseSizeWhy",
        value: `${MAX_RESPONSE_BYTES / (1_024 * 1_024)} MB`,
    },
    {
        id: "recordCap",
        labelKey: "recordCap",
        whyKey: "recordCapWhy",
        value: MAX_RECORDS.toLocaleString("en-US"),
    },
    { id: "pageSize", labelKey: "pageSize", whyKey: "pageSizeWhy", value: String(PAGE_SIZE) },
] as const;

export async function getSubdomainLookupFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("subdomainLookup.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
    ];
}

export async function SubdomainLookupArticle() {
    const [t, tSorts, tSortHints, tToc, faqs] = await Promise.all([
        getTranslations("subdomainLookup.article"),
        getTranslations("subdomainLookup.sorts"),
        getTranslations("subdomainLookup.sortHints"),
        getTranslations("subdomainLookup.toc"),
        getSubdomainLookupFaqEntries(),
    ]);

    const tocItems: TocItem[] = SUBDOMAIN_LOOKUP_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t("understanding.p1")}</p>
                        <p>{t("understanding.p2")}</p>
                        <ArticleExample>{t("understanding.example")}</ArticleExample>
                        <p>{t("understanding.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="source" title={t("source.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("source.p1", ARTICLE_TAGS)}</p>
                        <p>{t("source.p2")}</p>
                        <p>{t("source.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="reading" title={t("reading.title")}>
                    <div className={PROSE}>
                        <p>{t("reading.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("reading.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reading.colFigure")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reading.colMeans")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {READING_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`reading.${row.nameKey}`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`reading.${row.meansKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className="ring-border/80 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("options.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colOption")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`options.${row.nameKey}`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row.doesKey}`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row.whenKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* The orders, spelled out. A literal union, so every key is
                        checked at compile time. */}
                    <ul className={`mt-5 flex flex-col gap-2 ${PROSE_TEXT}`}>
                        {SUBDOMAIN_SORTS.map((value) => (
                            <li key={value} className="flex flex-col gap-0.5">
                                <span className="text-foreground text-[0.875rem] font-medium">
                                    {tSorts(value)}
                                </span>
                                <span className="text-[0.875rem] leading-6">
                                    {tSortHints(value)}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("options.caveats")}</p>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("limits.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("limits.colLimit")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("limits.colValue")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("limits.colWhy")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {LIMIT_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`limits.${row.labelKey}`)}
                                        </th>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-number text-[0.75rem] whitespace-nowrap">
                                                {row.value}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`limits.${row.whyKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("limits.upstream")}</p>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.attackSurface")}</p>
                        <p>{t("useCases.forgotten")}</p>
                        <p>{t("useCases.acquisition")}</p>
                        <p>{t("useCases.migration")}</p>
                        <p>{t("useCases.bounty")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
