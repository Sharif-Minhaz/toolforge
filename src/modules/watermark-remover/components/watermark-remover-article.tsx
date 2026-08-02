import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const WATERMARK_REMOVER_ARTICLE_SECTIONS = [
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "painting", titleKey: "painting.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "quality", titleKey: "quality.title" },
    { id: "rights", titleKey: "rights.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Mirrors the controls in the workbench, so the table documents what ships. */
const CONTROL_ROWS = [
    "upload",
    "brush",
    "paint",
    "undo",
    "clearMask",
    "remove",
    "compare",
    "download",
    "clear",
    "challenge",
] as const;

/** The four shapes a watermark actually turns up in. */
const SITUATION_ROWS = ["cornerLogo", "tiledText", "overSubject", "largeObject"] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getWatermarkRemoverFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("watermarkRemover.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function WatermarkRemoverArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("watermarkRemover.article"),
        getTranslations("watermarkRemover.toc"),
        getWatermarkRemoverFaqEntries(),
    ]);

    const tocItems: TocItem[] = WATERMARK_REMOVER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t("howItWorks.p1")}</p>
                        <p>{t("howItWorks.p2")}</p>
                        <p>{t("howItWorks.p3")}</p>
                        <p>{t("howItWorks.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="painting" title={t("painting.title")}>
                    <div className={PROSE}>
                        <p>{t("painting.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("painting.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("painting.colSituation")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("painting.colDo")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("painting.colExpect")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SITUATION_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`painting.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`painting.${row}Do`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`painting.${row}Expect`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("painting.tightNote")}</p>
                        <p>{t("painting.keyboardNote")}</p>
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
                        <p>{t("controls.dependencyNote")}</p>
                        <p>{t("controls.challengeNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="quality" title={t("quality.title")}>
                    <div className={PROSE}>
                        <p>{t("quality.p1")}</p>
                        <p>{t("quality.p2")}</p>
                        <p>{t("quality.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="rights" title={t("rights.title")}>
                    <div className={PROSE}>
                        <p>{t("rights.p1")}</p>
                        <p>{t("rights.p2")}</p>
                        <p>{t("rights.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.p1")}</p>
                        <p>{t("limits.p2")}</p>
                        <p>{t("limits.p3")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("limits.formatNote")}</p>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                        <p>{t("privacy.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
