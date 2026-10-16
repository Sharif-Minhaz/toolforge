import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const MOUSE_TESTER_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "zone", titleKey: "zone.title" },
    { id: "faults", titleKey: "faults.title" },
    { id: "polling", titleKey: "polling.title" },
    { id: "dpi", titleKey: "dpi.title" },
    { id: "options", titleKey: "options.title" },
    { id: "report", titleKey: "report.title" },
    { id: "mobile", titleKey: "mobile.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getMouseTesterFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("mouseTester.article");

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

export async function MouseTesterArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("mouseTester.article"),
        getTranslations("mouseTester.toc"),
        getMouseTesterFaqEntries(),
    ]);

    const tocItems: TocItem[] = MOUSE_TESTER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Literal unions, so every message key below is checked at compile time.
    const faultRows = ["chatter", "drop", "reversal"] as const;
    const optionRows = [
        "window",
        "hold",
        "dpiDistance",
        "dpiStage",
        "report",
        "reset",
        "link",
    ] as const;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t("understanding.p1")}</p>
                        <ArticleExample>
                            {t.rich("understanding.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t("understanding.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="zone" title={t("zone.title")}>
                    <div className={PROSE}>
                        <p>{t("zone.p1")}</p>
                        <p>{t("zone.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faults" title={t("faults.title")}>
                    <div className={PROSE}>
                        <p>{t("faults.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("faults.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("faults.colFault")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("faults.colSees")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("faults.colFeels")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("faults.colCaught")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {faultRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`faults.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`faults.${row}Sees`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`faults.${row}Feels`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`faults.${row}Caught`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("faults.note")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="polling" title={t("polling.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("polling.p1", ARTICLE_TAGS)}</p>
                        <p>{t("polling.p2")}</p>
                        <p>{t("polling.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="dpi" title={t("dpi.title")}>
                    <div className={PROSE}>
                        <p>{t("dpi.p1")}</p>
                        <ArticleExample>{t.rich("dpi.example", ARTICLE_TAGS)}</ArticleExample>
                        <p>{t("dpi.p2")}</p>
                        <p>{t("dpi.p3")}</p>
                    </div>
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
                                {optionRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t.rich(`options.${row}Name`, ARTICLE_TAGS)}
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
                        <p>{t("options.thresholdsNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="report" title={t("report.title")}>
                    <div className={PROSE}>
                        <p>{t("report.p1")}</p>
                        <p>{t("report.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="mobile" title={t("mobile.title")}>
                    <div className={PROSE}>
                        <p>{t("mobile.p1")}</p>
                        <p>{t("mobile.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
