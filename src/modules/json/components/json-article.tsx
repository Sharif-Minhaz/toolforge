import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const JSON_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "whyFormat", titleKey: "whyFormat.title" },
    { id: "templates", titleKey: "templates.title" },
    { id: "specs", titleKey: "specs.title" },
    { id: "options", titleKey: "options.title" },
    { id: "reading", titleKey: "reading.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getJsonFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("json.article");

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

const OPTION_ROWS = ["indent", "spec", "repair", "sortKeys", "escapeUnicode"] as const;

export async function JsonArticle() {
    const [t, tWorkbench, tToc, faqs] = await Promise.all([
        getTranslations("json.article"),
        getTranslations("json.workbench"),
        getTranslations("json.toc"),
        getJsonFaqEntries(),
    ]);

    const tocItems: TocItem[] = JSON_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Template names come from the control itself, so the table can never drift
    // away from what the picker offers.
    const templateRows = [
        {
            name: tWorkbench("indents.space2"),
            looks: t("templates.space2Looks"),
            bestFor: t("templates.space2BestFor"),
        },
        {
            name: tWorkbench("indents.space3"),
            looks: t("templates.space3Looks"),
            bestFor: t("templates.space3BestFor"),
        },
        {
            name: tWorkbench("indents.space4"),
            looks: t("templates.space4Looks"),
            bestFor: t("templates.space4BestFor"),
        },
        {
            name: tWorkbench("indents.tab"),
            looks: t("templates.tabLooks"),
            bestFor: t("templates.tabBestFor"),
        },
        {
            name: t("templates.minifiedName"),
            looks: t("templates.minifiedLooks"),
            bestFor: t("templates.minifiedBestFor"),
        },
    ];

    // Specification names are proper nouns, so they stay out of the catalogue.
    const specRows = [
        { spec: "RFC 8259", root: t("specs.rfc8259Root"), here: t("specs.rfc8259Here") },
        { spec: "RFC 7159", root: t("specs.rfc7159Root"), here: t("specs.rfc7159Here") },
        { spec: "RFC 4627", root: t("specs.rfc4627Root"), here: t("specs.rfc4627Here") },
        { spec: "ECMA-404", root: t("specs.ecma404Root"), here: t("specs.ecma404Here") },
    ];

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

                <ArticleSection id="whyFormat" title={t("whyFormat.title")}>
                    <div className={PROSE}>
                        <p>{t("whyFormat.p1")}</p>
                        <p>{t("whyFormat.p2")}</p>
                        <p>{t("whyFormat.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="templates" title={t("templates.title")}>
                    <div className={PROSE}>
                        <p>{t("templates.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("templates.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("templates.colTemplate")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("templates.colLooks")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("templates.colBestFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {templateRows.map((row) => (
                                    <tr key={row.name} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.name}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.looks}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.bestFor}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("templates.note")}</p>
                </ArticleSection>

                <ArticleSection id="specs" title={t("specs.title")}>
                    <div className={PROSE}>
                        <p>{t("specs.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("specs.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("specs.colSpec")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("specs.colRoot")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("specs.colHere")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {specRows.map((row) => (
                                    <tr key={row.spec} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.spec}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.root}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.here}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("specs.note")}</p>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t("options.intro")}</p>
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
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`options.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("options.interactionNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="reading" title={t("reading.title")}>
                    <div className={PROSE}>
                        <p>{t("reading.p1")}</p>
                        <p>{t("reading.p2")}</p>
                        <p>{t("reading.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t("howItWorks.p1")}</p>
                        <p>{t("howItWorks.p2")}</p>
                        <p>{t("howItWorks.p3")}</p>
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
