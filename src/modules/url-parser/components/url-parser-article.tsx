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
import { URL_PART_IDS } from "../types";

export const URL_PARSER_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "parts", titleKey: "parts.title" },
    { id: "params", titleKey: "params.title" },
    { id: "normalisation", titleKey: "normalisation.title" },
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
export async function getUrlParserFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("urlParser.article");

    return (["1", "2", "3", "4", "5", "6"] as const).map((index) => ({
        question: t(`faq.q${index}`),
        answer: t.markup(`faq.a${index}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${index}`, ARTICLE_TAGS),
    }));
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
                        <ArticleExample>
                            {t.rich("understanding.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
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
                                            {t.rich(`parts.${part}Holds`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`parts.${part}Watch`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="params" title={t("params.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("params.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("params.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("params.p3", ARTICLE_TAGS)}</p>
                        <p>{t("params.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="normalisation" title={t("normalisation.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("normalisation.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("normalisation.p2", ARTICLE_TAGS)}</p>
                        <p>{t("normalisation.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t.rich("useCases.p2", ARTICLE_TAGS)}</p>
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
