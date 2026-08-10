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
import { SHELL_DIALECTS } from "../types";

export const CURL_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "dialects", titleKey: "dialects.title" },
    { id: "coverage", titleKey: "coverage.title" },
    { id: "options", titleKey: "options.title" },
    { id: "gotchas", titleKey: "gotchas.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * The coverage table, as data.
 *
 * Every cell but the row label is a flag or an option name — proper names,
 * which are data rather than copy and stay out of the message catalogue. `null`
 * means the language has no way to say it at all, and renders as a dash.
 */
const COVERAGE_ROWS = [
    { id: "method", curl: "-X", fetch: "method", axios: "method", node: "method" },
    { id: "query", curl: "?a=b", fetch: "URL", axios: "url", node: "path" },
    { id: "headers", curl: "-H", fetch: "headers", axios: "headers", node: "headers" },
    { id: "cookies", curl: "-b", fetch: "Cookie", axios: "Cookie", node: "Cookie" },
    { id: "basicAuth", curl: "-u", fetch: "Authorization", axios: "auth", node: "Authorization" },
    { id: "bodyForm", curl: "-d", fetch: "URLSearchParams", axios: "data", node: "write()" },
    { id: "bodyJson", curl: "--json", fetch: "JSON.stringify", axios: "data", node: "write()" },
    { id: "bodyMultipart", curl: "-F", fetch: "FormData", axios: "FormData", node: null },
    { id: "followRedirects", curl: "-L", fetch: "redirect", axios: "maxRedirects", node: null },
    { id: "maxRedirects", curl: "--max-redirs", fetch: null, axios: "maxRedirects", node: null },
    {
        id: "timeout",
        curl: "-m",
        fetch: "AbortSignal.timeout",
        axios: "timeout",
        node: "timeout",
    },
    { id: "connectTimeout", curl: "--connect-timeout", fetch: null, axios: null, node: null },
    {
        id: "insecure",
        curl: "-k",
        fetch: "dispatcher",
        axios: "httpsAgent",
        node: "rejectUnauthorized",
    },
    { id: "clientCert", curl: "-E", fetch: null, axios: "httpsAgent", node: "cert" },
    { id: "proxy", curl: "-x", fetch: "dispatcher", axios: "proxy", node: null },
    {
        id: "unixSocket",
        curl: "--unix-socket",
        fetch: null,
        axios: "socketPath",
        node: "socketPath",
    },
    { id: "httpVersion", curl: "--http2", fetch: null, axios: null, node: null },
    { id: "retry", curl: "--retry", fetch: null, axios: null, node: null },
] as const;

/** Option rows take their names from the workbench, so the two cannot drift. */
const OPTION_ROWS = [
    "target",
    "runtime",
    "style",
    "headersStyle",
    "includeResponse",
    "indent",
    "shell",
    "longFlags",
    "multiLine",
    "explicitMethod",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getCurlFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("curl.article");

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

export async function CurlArticle() {
    const [t, tShells, tWorkbench, tToc, faqs] = await Promise.all([
        getTranslations("curl.article"),
        getTranslations("curl.shells"),
        getTranslations("curl.workbench"),
        getTranslations("curl.toc"),
        getCurlFaqEntries(),
    ]);

    const tocItems: TocItem[] = CURL_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    const cell = (value: string | null) => (
        <code className={value === null ? "text-muted-foreground/60" : "text-primary"}>
            {value ?? t("coverage.none")}
        </code>
    );

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            {t.rich("understanding.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="dialects" title={t("dialects.title")}>
                    <div className={PROSE}>
                        <p>{t("dialects.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("dialects.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("dialects.colShell")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("dialects.colQuote")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("dialects.colContinue")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("dialects.colWatch")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {/* A literal union, so every key below is
                                    checked at compile time. */}
                                {SHELL_DIALECTS.map((shell) => (
                                    <tr key={shell} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tShells(shell)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`dialects.${shell}Quote`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`dialects.${shell}Continue`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`dialects.${shell}Watch`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("dialects.p1")}</p>
                </ArticleSection>

                <ArticleSection id="coverage" title={t("coverage.title")}>
                    <div className={PROSE}>
                        <p>{t("coverage.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("coverage.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("coverage.colFeature")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("coverage.colCurl")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("coverage.colFetch")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("coverage.colAxios")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("coverage.colNode")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {COVERAGE_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            {t(`coverage.${row.id}`)}
                                        </th>
                                        <td className="px-4 py-3 font-mono text-[0.75rem] whitespace-nowrap">
                                            {cell(row.curl)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[0.75rem] whitespace-nowrap">
                                            {cell(row.fetch)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[0.75rem] whitespace-nowrap">
                                            {cell(row.axios)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[0.75rem] whitespace-nowrap">
                                            {cell(row.node)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("coverage.p1")}</p>
                        <p>{t("coverage.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className="ring-border/80 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
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
                                {OPTION_ROWS.map((option) => (
                                    <tr key={option} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {/* The control's own label, so the
                                                table cannot drift from the UI. */}
                                            {tWorkbench(option)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${option}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${option}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("options.p1")}</p>
                        <p>{t("options.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="gotchas" title={t("gotchas.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("gotchas.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("gotchas.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("gotchas.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("gotchas.p4", ARTICLE_TAGS)}</p>
                        <p>{t.rich("gotchas.p5", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                        <p>{t("useCases.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
