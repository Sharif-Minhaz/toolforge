import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const BLUR_PLACEHOLDER_ARTICLE_SECTIONS = [
    { id: "whatItIs", titleKey: "whatItIs.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "components", titleKey: "components.title" },
    { id: "aspect", titleKey: "aspect.title" },
    { id: "usage", titleKey: "usage.title" },
    { id: "alternatives", titleKey: "alternatives.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getBlurPlaceholderFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("blurPlaceholder.article");

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

export async function BlurPlaceholderArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("blurPlaceholder.article"),
        getTranslations("blurPlaceholder.toc"),
        getBlurPlaceholderFaqEntries(),
    ]);

    const tocItems: TocItem[] = BLUR_PLACEHOLDER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // A literal union, so every message key below is checked at compile time.
    const controlRows = [
        "mode",
        "source",
        "hash",
        "componentX",
        "componentY",
        "ratio",
        "edge",
        "punch",
        "snippet",
    ] as const;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="whatItIs" title={t("whatItIs.title")}>
                    <div className={PROSE}>
                        <p>{t("whatItIs.p1")}</p>
                        <p>{t("whatItIs.p2")}</p>
                        <p>{t("whatItIs.p3")}</p>
                        <p>{t("whatItIs.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t("howItWorks.p1")}</p>
                        <p>{t("howItWorks.p2")}</p>
                        <p>{t("howItWorks.p3")}</p>
                        <p>{t("howItWorks.p4")}</p>
                        <p>{t("howItWorks.p5")}</p>
                    </div>
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
                                {controlRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-medium whitespace-nowrap"
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
                        <p>{t("controls.disabledNote")}</p>
                        <p>{t("controls.punchNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="components" title={t("components.title")}>
                    <div className={PROSE}>
                        <p>{t("components.p1")}</p>
                        <p>{t("components.p2")}</p>
                        <p>{t("components.p3")}</p>
                        <p>{t("components.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="aspect" title={t("aspect.title")}>
                    <div className={PROSE}>
                        <p>{t("aspect.p1")}</p>
                        <p>{t("aspect.p2")}</p>
                        <p>{t("aspect.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="usage" title={t("usage.title")}>
                    <div className={PROSE}>
                        <p>{t("usage.p1")}</p>
                        <p>{t("usage.p2")}</p>
                        <p>{t("usage.p3")}</p>
                        <p>{t("usage.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="alternatives" title={t("alternatives.title")}>
                    <div className={PROSE}>
                        <p>{t("alternatives.p1")}</p>
                        <p>{t("alternatives.p2")}</p>
                        <p>{t("alternatives.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.p1")}</p>
                        <p>{t("limits.p2")}</p>
                        <p>{t("limits.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
