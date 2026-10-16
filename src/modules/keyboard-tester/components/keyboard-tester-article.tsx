import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const KEYBOARD_TESTER_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "layouts", titleKey: "layouts.title" },
    { id: "chatter", titleKey: "chatter.title" },
    { id: "rollover", titleKey: "rollover.title" },
    { id: "systemKeys", titleKey: "systemKeys.title" },
    { id: "options", titleKey: "options.title" },
    { id: "mobile", titleKey: "mobile.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getKeyboardTesterFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("keyboardTester.article");

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

export async function KeyboardTesterArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("keyboardTester.article"),
        getTranslations("keyboardTester.toc"),
        getKeyboardTesterFaqEntries(),
    ]);

    const tocItems: TocItem[] = KEYBOARD_TESTER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Literal unions, so every message key below is checked at compile time.
    const optionRows = [
        "size",
        "standard",
        "labels",
        "window",
        "systemKeys",
        "report",
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
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="layouts" title={t("layouts.title")}>
                    <div className={PROSE}>
                        <p>{t("layouts.p1")}</p>
                        <p>{t("layouts.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="chatter" title={t("chatter.title")}>
                    <div className={PROSE}>
                        <p>{t("chatter.p1")}</p>
                        <p>{t("chatter.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="rollover" title={t("rollover.title")}>
                    <div className={PROSE}>
                        <p>{t("rollover.p1")}</p>
                        <p>{t("rollover.p2")}</p>
                        <p>{t("rollover.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="systemKeys" title={t("systemKeys.title")}>
                    <div className={PROSE}>
                        <p>{t("systemKeys.p1")}</p>
                        <p>{t("systemKeys.p2")}</p>
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
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
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
                        <p>{t("options.note")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="mobile" title={t("mobile.title")}>
                    <div className={PROSE}>
                        <p>{t("mobile.p1")}</p>
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
