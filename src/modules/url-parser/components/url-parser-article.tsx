import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { URL_PART_IDS } from "../types";

export const URL_PARSER_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "parts", titleKey: "parts.title" },
    { id: "params", titleKey: "params.title" },
    { id: "normalisation", titleKey: "normalisation.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getUrlParserFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("urlParser.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function UrlParserArticle() {
    const [t, tParts, tToc, faqs] = await Promise.all([
        getTranslations("urlParser.article"),
        getTranslations("urlParser.parts"),
        getTranslations("urlParser.toc"),
        getUrlParserFaqEntries(),
    ]);

    const tocItems: TocItem[] = URL_PARSER_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="parts" title={t("parts.title")}>
                    <div className={PROSE}>
                        <p>{t("parts.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("parts.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("parts.colPart")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("parts.colHolds")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("parts.colWatch")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {/* A literal union, so every key below is checked
                                    at compile time. */}
                                {URL_PART_IDS.map((part) => (
                                    <tr key={part} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tParts(part)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`parts.${part}Holds`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`parts.${part}Watch`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="params" title={t("params.title")}>
                    <div className={PROSE}>
                        <p>{t("params.p1")}</p>
                        <p>{t("params.p2")}</p>
                        <p>{t("params.p3")}</p>
                        <p>{t("params.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="normalisation" title={t("normalisation.title")}>
                    <div className={PROSE}>
                        <p>{t("normalisation.p1")}</p>
                        <p>{t("normalisation.p2")}</p>
                        <p>{t("normalisation.p3")}</p>
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
