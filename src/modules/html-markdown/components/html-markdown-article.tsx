import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const HTML_MARKDOWN_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "why", titleKey: "why.title" },
    { id: "mapping", titleKey: "mapping.title" },
    { id: "options", titleKey: "options.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getHtmlMarkdownFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("htmlMarkdown.article");

    return [
        {
            question: t("faq.q1"),
            answer: t.markup("faq.a1", PLAIN_TAGS),
            answerNode: t.rich("faq.a1", ARTICLE_TAGS),
        },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        {
            question: t("faq.q5"),
            answer: t.markup("faq.a5", PLAIN_TAGS),
            answerNode: t.rich("faq.a5", ARTICLE_TAGS),
        },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function HtmlMarkdownArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("htmlMarkdown.article"),
        getTranslations("htmlMarkdown.toc"),
        getHtmlMarkdownFaqEntries(),
    ]);

    const tocItems: TocItem[] = HTML_MARKDOWN_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    const optionRows = [
        "gfm",
        "headingStyle",
        "bulletMarker",
        "codeBlockStyle",
        "emphasisStyle",
        "linkStyle",
        "keepHtml",
        "lineBreaks",
        "fullDocument",
    ] as const;

    const mappingRows = [
        { html: "<h1>…</h1>", markdown: "# …" },
        { html: "<strong>…</strong>", markdown: "**…**" },
        { html: "<em>…</em>", markdown: "_…_" },
        { html: "<code>…</code>", markdown: "`…`" },
        { html: '<pre><code class="language-ts">', markdown: "```ts" },
        { html: "<ul><li>…</li></ul>", markdown: "- …" },
        { html: "<blockquote>…</blockquote>", markdown: "> …" },
        { html: '<a href="…">…</a>', markdown: "[…](…)" },
        { html: "<table>…</table>", markdown: "| … | … |" },
        { html: "<del>…</del>", markdown: "~~…~~" },
        { html: "<kbd>…</kbd>", markdown: "<kbd>…</kbd>" },
    ];

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

                <ArticleSection id="why" title={t("why.title")}>
                    <div className={PROSE}>
                        <p>{t("why.p1")}</p>
                        <p>{t.rich("why.p2", ARTICLE_TAGS)}</p>
                        <p>{t("why.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="mapping" title={t("mapping.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("mapping.intro", ARTICLE_TAGS)}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-120 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("mapping.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("mapping.colHtml")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("mapping.colMarkdown")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {mappingRows.map((row) => (
                                    <tr key={row.html} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium"
                                        >
                                            {row.html}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem]">
                                            {row.markdown}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>
                        {t.rich("mapping.gfmNote", ARTICLE_TAGS)}
                    </p>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("options.intro", ARTICLE_TAGS)}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
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
                                {optionRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`options.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`options.${row}Does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`options.${row}When`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("options.directionNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.fenceNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.defaultsNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("limits.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("limits.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("limits.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t.rich("useCases.p2", ARTICLE_TAGS)}</p>
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
