import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { SEPARATOR_CHARACTERS } from "../domain/constants";

export const SLUG_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "separators", titleKey: "separators.title" },
    { id: "options", titleKey: "options.title" },
    { id: "scripts", titleKey: "scripts.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getSlugFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("slug.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function SlugArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("slug.article"),
        getTranslations("slug.toc"),
        getSlugFaqEntries(),
    ]);

    const tocItems: TocItem[] = SLUG_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Literal unions, so every message key below is checked at compile time.
    const separatorRows = ["dash", "underscore", "dot", "tilde"] as const;
    const optionRows = [
        "separator",
        "lowercase",
        "ascii",
        "stopWords",
        "numbers",
        "maxLength",
        "perLine",
    ] as const;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="min-w-0 xl:order-2">
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

                <ArticleSection id="separators" title={t("separators.title")}>
                    <div className={PROSE}>
                        <p>{t("separators.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("separators.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("separators.colCharacter")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("separators.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("separators.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {separatorRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-base font-medium"
                                        >
                                            {SEPARATOR_CHARACTERS[row]}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`separators.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`separators.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("separators.custom")}</p>
                        <p>{t("separators.refused")}</p>
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
                        <p>{t("options.orderNote")}</p>
                        <p>{t("options.lengthNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="scripts" title={t("scripts.title")}>
                    <div className={PROSE}>
                        <p>{t("scripts.p1")}</p>
                        <p>{t("scripts.p2")}</p>
                        <p>{t("scripts.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("useCases.p3")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
