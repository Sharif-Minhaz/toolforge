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

export const UUID_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "why", titleKey: "why.title" },
    { id: "types", titleKey: "types.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
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
export async function getUuidFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("uuid.article");

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
    ];
}

export async function UuidArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("uuid.article"),
        getTranslations("uuid.toc"),
        getUuidFaqEntries(),
    ]);

    const tocItems: TocItem[] = UUID_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    const versionRows = (["v1", "v4", "v7"] as const).map((version) => ({
        version,
        basis: t.rich(`types.${version}Basis`, ARTICLE_TAGS),
        sortable: t.rich(`types.${version}Sortable`, ARTICLE_TAGS),
        bestFor: t.rich(`types.${version}BestFor`, ARTICLE_TAGS),
    }));

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
                        <p>{t("why.p2")}</p>
                        <p>{t.rich("why.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="types" title={t("types.title")}>
                    <div className={PROSE}>
                        <p>{t("types.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("types.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colVersion")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colBasis")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colSortable")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("types.colBestFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {versionRows.map((row) => (
                                    <tr key={row.version} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium"
                                        >
                                            {row.version}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.basis}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.sortable}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.bestFor}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t.rich("types.others", ARTICLE_TAGS)}</p>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("howItWorks.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p2", ARTICLE_TAGS)}</p>
                        <p>{t("howItWorks.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("useCases.p1", ARTICLE_TAGS)}</p>
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
