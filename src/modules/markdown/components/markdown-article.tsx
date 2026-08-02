import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MARKDOWN_ALERT_KINDS } from "../types";

export const MARKDOWN_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "syntax", titleKey: "syntax.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "diagrams", titleKey: "diagrams.title" },
    { id: "math", titleKey: "math.title" },
    { id: "alerts", titleKey: "alerts.title" },
    { id: "safety", titleKey: "safety.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * The syntax itself is data, not copy — `**bold**` is `**bold**` in every
 * locale — so it lives here and only the description crosses into the message
 * catalogue.
 */
const SYNTAX_ROWS = [
    { key: "heading", syntax: "# Title\n###### Smallest" },
    { key: "emphasis", syntax: "**bold**  _italic_  ~~struck~~" },
    { key: "code", syntax: "`inline`" },
    { key: "fence", syntax: "```ts\nconst a = 1;\n```" },
    { key: "link", syntax: '[label](https://example.com "title")' },
    { key: "image", syntax: "![alt](/logo.png)" },
    { key: "bullets", syntax: "- one\n- two\n    - nested" },
    { key: "ordered", syntax: "1. one\n2. two" },
    { key: "task", syntax: "- [x] done\n- [ ] todo" },
    { key: "quote", syntax: "> quoted" },
    { key: "table", syntax: "| a | b |\n| :-- | --: |\n| 1 | 2 |" },
    { key: "rule", syntax: "---" },
    { key: "escape", syntax: "\\*not emphasis\\*" },
    { key: "entity", syntax: "&mdash;  &#8230;" },
] as const;

const CONTROL_ROWS = [
    "view",
    "syncScroll",
    "fullscreen",
    "toolbar",
    "shortcuts",
    "reset",
    "copy",
    "downloadMarkdown",
    "downloadHtml",
    "print",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getMarkdownFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("markdown.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function MarkdownArticle() {
    const [t, tAlerts, tToc, faqs] = await Promise.all([
        getTranslations("markdown.article"),
        getTranslations("markdown.alerts"),
        getTranslations("markdown.toc"),
        getMarkdownFaqEntries(),
    ]);

    const tocItems: TocItem[] = MARKDOWN_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t("understanding.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="syntax" title={t("syntax.title")}>
                    <div className={PROSE}>
                        <p>{t("syntax.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("syntax.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("syntax.colSyntax")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("syntax.colDoes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SYNTAX_ROWS.map((row) => (
                                    <tr key={row.key} className="align-top">
                                        <th scope="row" className="px-4 py-3 font-normal">
                                            <pre className="text-primary font-mono text-[0.8125rem] leading-6 whitespace-pre">
                                                {row.syntax}
                                            </pre>
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`syntax.${row.key}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("syntax.note")}</p>
                </ArticleSection>

                <ArticleSection id="controls" title={t("controls.title")}>
                    <div className={PROSE}>
                        <p>{t("controls.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("controls.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colControl")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CONTROL_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`controls.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`controls.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`controls.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("controls.viewNote")}</p>
                        <p>{t("controls.fullscreenNote")}</p>
                        <p>{t("controls.exportNote")}</p>
                        <p>{t("controls.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="diagrams" title={t("diagrams.title")}>
                    <div className={PROSE}>
                        <p>{t("diagrams.p1")}</p>
                        <p>{t("diagrams.p2")}</p>
                        <p>{t("diagrams.p3")}</p>
                    </div>

                    <pre className="ring-border/70 bg-muted/50 mt-5 overflow-x-auto rounded-xl p-4 font-mono text-[0.8125rem] leading-6 ring-1 ring-inset">
                        {
                            "```mermaid\nflowchart LR\n    A[Start] --> B{Works?}\n    B -->|Yes| C[Ship]\n    B -->|No| D[Debug]\n    D --> B\n```"
                        }
                    </pre>
                </ArticleSection>

                <ArticleSection id="math" title={t("math.title")}>
                    <div className={PROSE}>
                        <p>{t("math.p1")}</p>
                        <p>{t("math.p2")}</p>
                        <p>{t("math.p3")}</p>
                    </div>

                    <pre className="ring-border/70 bg-muted/50 mt-5 overflow-x-auto rounded-xl p-4 font-mono text-[0.8125rem] leading-6 ring-1 ring-inset">
                        {"Inline: $E = mc^2$\n\n$$\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}$$"}
                    </pre>
                </ArticleSection>

                <ArticleSection id="alerts" title={t("alerts.title")}>
                    <div className={PROSE}>
                        <p>{t("alerts.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("alerts.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("alerts.colMarker")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("alerts.colLabel")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("alerts.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {MARKDOWN_ALERT_KINDS.map((kind) => (
                                    <tr key={kind} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {`> [!${kind.toUpperCase()}]`}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {tAlerts(kind)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`alerts.${kind}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("alerts.note")}</p>
                </ArticleSection>

                <ArticleSection id="safety" title={t("safety.title")}>
                    <div className={PROSE}>
                        <p>{t("safety.p1")}</p>
                        <p>{t("safety.p2")}</p>
                        <p>{t("safety.p3")}</p>
                        <p>{t("safety.p4")}</p>
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
