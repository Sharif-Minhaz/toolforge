import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import {
    DOCUMENT_WARN_RATIO,
    MAX_COLLECTIONS,
    MAX_DOCUMENT_BYTES,
    MAX_DOCUMENT_DEPTH,
    MAX_ITEMS_PER_COLLECTION,
    MAX_UPLOAD_BYTES,
} from "@/modules/tools/domain/document-limits";

import {
    DEFAULT_PER_PAGE,
    MAX_LOG_ROWS,
    MAX_PER_PAGE,
    MAX_SERVERS_PER_BROWSER,
} from "../domain/constants";
import type { ConditionOperator } from "../domain/query";

export const JSON_SERVER_ARTICLE_SECTIONS = [
    { id: "flow", titleKey: "flow.title" },
    { id: "document", titleKey: "document.title" },
    { id: "routes", titleKey: "routes.title" },
    { id: "query", titleKey: "query.title" },
    { id: "writing", titleKey: "writing.title" },
    { id: "storage", titleKey: "storage.title" },
    { id: "differences", titleKey: "differences.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * The walk-through, in order.
 *
 * The studio is a route tree rather than a single workbench, so the one thing
 * this article has to carry that a tool page's does not is *sequence*. Anybody
 * arriving from `json-server`'s README already knows the query language; what
 * they do not know is which screen here corresponds to running the command.
 */
const FLOW_STEPS = ["document", "create", "recoveryKey", "routes", "call", "watch"] as const;

/**
 * The routes a collection and a singular resource publish.
 *
 * Paths and methods are data, not copy: a translated `/posts/:id` is a route
 * that does not exist. `posts` and `profile` are the sample document's own
 * names, so every row can be pasted against a fresh server unedited.
 */
const ROUTE_ROWS = [
    { id: "list", method: "GET", path: "/posts", doesKey: "doesList" },
    { id: "create", method: "POST", path: "/posts", doesKey: "doesCreate" },
    { id: "read", method: "GET", path: "/posts/1", doesKey: "doesRead" },
    { id: "replace", method: "PUT", path: "/posts/1", doesKey: "doesReplace" },
    { id: "merge", method: "PATCH", path: "/posts/1", doesKey: "doesMerge" },
    { id: "remove", method: "DELETE", path: "/posts/1", doesKey: "doesRemove" },
    { id: "singular", method: "GET", path: "/profile", doesKey: "doesSingular" },
    { id: "singularWrite", method: "PATCH", path: "/profile", doesKey: "doesSingularWrite" },
    { id: "root", method: "GET", path: "/", doesKey: "doesRoot" },
] as const;

/**
 * The filter operators, in the engine's own order.
 *
 * `satisfies` ties every `id` to `ConditionOperator`, so renaming one in
 * `domain/query.ts` fails the build here rather than leaving the table quietly
 * describing an operator the server no longer answers to.
 */
const OPERATOR_ROWS = [
    { id: "eq", example: "?views=100", meansKey: "meansEq" },
    { id: "ne", example: "?views:ne=100", meansKey: "meansNe" },
    { id: "lt", example: "?views:lt=100", meansKey: "meansLt" },
    { id: "lte", example: "?views:lte=100", meansKey: "meansLte" },
    { id: "gt", example: "?views:gt=100", meansKey: "meansGt" },
    { id: "gte", example: "?views:gte=100", meansKey: "meansGte" },
    { id: "in", example: "?id:in=1,2,3", meansKey: "meansIn" },
    { id: "contains", example: "?title:contains=title", meansKey: "meansContains" },
    { id: "startsWith", example: "?title:startsWith=a", meansKey: "meansStartsWith" },
    { id: "endsWith", example: "?title:endsWith=title", meansKey: "meansEndsWith" },
] as const satisfies readonly {
    id: ConditionOperator;
    example: string;
    meansKey: string;
}[];

/** The query keys the engine reads itself; everything else is a field condition. */
const QUERY_KEY_ROWS = [
    { id: "sort", key: "_sort", example: "?_sort=views,-title", doesKey: "doesSort" },
    { id: "page", key: "_page", example: "?_page=2", doesKey: "doesPage" },
    { id: "perPage", key: "_per_page", example: "?_page=1&_per_page=25", doesKey: "doesPerPage" },
    { id: "embed", key: "_embed", example: "?_embed=comments", doesKey: "doesEmbed" },
    { id: "where", key: "_where", example: "?_where=…", doesKey: "doesWhere" },
    {
        id: "dependent",
        key: "_dependent",
        example: "?_dependent=comments",
        doesKey: "doesDependent",
    },
] as const;

/**
 * The limits table, read from the constants rather than retyped.
 *
 * Copy that names a number the code no longer uses is worse than copy that
 * names none, and these move. Each row carries a unit message with an ICU
 * `{value, number}` argument so Bangla renders Bengali numerals.
 */
const LIMIT_ROWS = [
    {
        id: "servers",
        labelKey: "labelServers",
        value: MAX_SERVERS_PER_BROWSER,
        unitKey: "unitPerBrowser",
        whyKey: "whyServers",
    },
    {
        id: "upload",
        labelKey: "labelUpload",
        value: MAX_UPLOAD_BYTES / 1_024,
        unitKey: "unitKilobytes",
        whyKey: "whyUpload",
    },
    {
        id: "document",
        labelKey: "labelDocument",
        value: MAX_DOCUMENT_BYTES / (1_024 * 1_024),
        unitKey: "unitMegabytes",
        whyKey: "whyDocument",
    },
    {
        id: "warn",
        labelKey: "labelWarn",
        value: Math.round(DOCUMENT_WARN_RATIO * 100),
        unitKey: "unitPercent",
        whyKey: "whyWarn",
    },
    {
        id: "collections",
        labelKey: "labelCollections",
        value: MAX_COLLECTIONS,
        unitKey: "unitPerDocument",
        whyKey: "whyCollections",
    },
    {
        id: "records",
        labelKey: "labelRecords",
        value: MAX_ITEMS_PER_COLLECTION,
        unitKey: "unitPerCollection",
        whyKey: "whyRecords",
    },
    {
        id: "depth",
        labelKey: "labelDepth",
        value: MAX_DOCUMENT_DEPTH,
        unitKey: "unitLevels",
        whyKey: "whyDepth",
    },
    {
        id: "perPage",
        labelKey: "labelPerPage",
        value: MAX_PER_PAGE,
        unitKey: "unitPerRequest",
        whyKey: "whyPerPage",
    },
    {
        id: "logs",
        labelKey: "labelLogs",
        value: MAX_LOG_ROWS,
        unitKey: "unitPerServer",
        whyKey: "whyLogs",
    },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getJsonServerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("jsonServer.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

export async function JsonServerArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("jsonServer.article"),
        getTranslations("jsonServer.toc"),
        getJsonServerFaqEntries(),
    ]);

    const tocItems: TocItem[] = JSON_SERVER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="flow" title={t("flow.title")}>
                    <p className={PROSE_TEXT}>{t("flow.intro")}</p>

                    <ol className="mt-5 flex flex-col gap-4">
                        {FLOW_STEPS.map((step, index) => (
                            <li key={step} className="flex gap-3.5">
                                <span
                                    aria-hidden="true"
                                    className="bg-card text-muted-foreground ring-border/70 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ring-1 ring-inset"
                                >
                                    {index + 1}
                                </span>
                                <div className="min-w-0">
                                    <h3 className="text-foreground text-[0.9375rem] leading-6 font-medium">
                                        {t(`flow.${step}Title`)}
                                    </h3>
                                    <p className={`mt-1 ${PROSE_TEXT}`}>{t(`flow.${step}Body`)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("flow.outro")}</p>
                </ArticleSection>

                <ArticleSection id="document" title={t("document.title")}>
                    <div className={PROSE}>
                        <p>{t("document.p1")}</p>
                        <p>{t("document.p2")}</p>
                        <p>{t("document.p3")}</p>
                        <p>{t("document.p4")}</p>
                        <p>{t("document.p5")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="routes" title={t("routes.title")}>
                    <div className={PROSE}>
                        <p>{t("routes.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("routes.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("routes.colMethod")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("routes.colPath")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("routes.colDoes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {ROUTE_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.method}
                                        </th>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-key text-[0.75rem] break-all">
                                                {row.path}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`routes.${row.doesKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("routes.p1")}</p>
                        <p>{t("routes.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="query" title={t("query.title")}>
                    <div className={PROSE}>
                        <p>{t("query.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("query.operatorCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("query.colOperator")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("query.colExample")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("query.colMeans")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {OPERATOR_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.id}
                                        </th>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-string text-[0.75rem] break-all">
                                                {row.example}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`query.${row.meansKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("query.keysIntro")}</p>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("query.keyCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("query.colKey")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("query.colExample")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("query.colDoes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {QUERY_KEY_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th scope="row" className="px-4 py-3 font-medium">
                                            <code className="text-syntax-key text-[0.75rem] break-all">
                                                {row.key}
                                            </code>
                                        </th>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-string text-[0.75rem] break-all">
                                                {row.example}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`query.${row.doesKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("query.p1")}</p>
                        <p>{t("query.p2")}</p>
                        <p>{t("query.p3", { value: DEFAULT_PER_PAGE })}</p>
                        <p>{t("query.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="writing" title={t("writing.title")}>
                    <div className={PROSE}>
                        <p>{t("writing.p1")}</p>
                        <p>{t("writing.p2")}</p>
                        <p>{t("writing.p3")}</p>
                        <p>{t("writing.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="storage" title={t("storage.title")}>
                    <div className={PROSE}>
                        <p>{t("storage.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("storage.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("storage.colLimit")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("storage.colValue")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("storage.colWhy")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {LIMIT_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            {t(`storage.${row.labelKey}`)}
                                        </th>
                                        <td className="text-foreground px-4 py-3 whitespace-nowrap">
                                            {t(`storage.${row.unitKey}`, { value: row.value })}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`storage.${row.whyKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("storage.p1")}</p>
                        <p>{t("storage.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="differences" title={t("differences.title")}>
                    <div className={PROSE}>
                        <p>{t("differences.p1")}</p>
                        <p>{t("differences.p2")}</p>
                        <p>{t("differences.p3")}</p>
                        <p>{t("differences.p4")}</p>
                        <p>{t("differences.p5")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
