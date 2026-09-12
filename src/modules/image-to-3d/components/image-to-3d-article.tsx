import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

import { MODEL_FORMATS } from "../types";

export const IMAGE_TO_3D_ARTICLE_SECTIONS = [
    { id: "whatItIs", titleKey: "whatItIs.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "formats", titleKey: "formats.title" },
    { id: "printing", titleKey: "printing.title" },
    { id: "blender", titleKey: "blender.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getImageTo3dFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("imageTo3d.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
        { question: t("faq.q9"), answer: t("faq.a9") },
        { question: t("faq.q10"), answer: t("faq.a10") },
    ];
}

export async function ImageTo3dArticle() {
    const [t, tToc, tFormats, faqs] = await Promise.all([
        getTranslations("imageTo3d.article"),
        getTranslations("imageTo3d.toc"),
        getTranslations("imageTo3d.formats"),
        getImageTo3dFaqEntries(),
    ]);

    const tocItems: TocItem[] = IMAGE_TO_3D_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Literal unions, so every message key below is checked at compile time.
    const controlRows = [
        "cutout",
        "source",
        "invert",
        "smoothing",
        "resolution",
        "shape",
        "width",
        "depth",
        "solid",
        "base",
        "detail",
        "format",
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
                    </div>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t("howItWorks.p1")}</p>
                        <p>{t("howItWorks.p2")}</p>
                        <p>{t("howItWorks.p3")}</p>
                        <p>{t("howItWorks.p4")}</p>
                        <p>{t("howItWorks.p5")}</p>
                        <p>{t("howItWorks.p6")}</p>
                        <p>{t("howItWorks.p7")}</p>
                        <p>{t("howItWorks.p8")}</p>
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
                        <p>{t("controls.cylinderNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="formats" title={t("formats.title")}>
                    <div className={PROSE}>
                        <p>{t("formats.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("formats.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colFormat")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colCarries")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colUse")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {MODEL_FORMATS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-medium whitespace-nowrap"
                                        >
                                            {tFormats(`${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`formats.${row}Carries`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`formats.${row}Use`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <h3>{t("formats.unitsTitle")}</h3>
                        <p>{t("formats.unitsBody")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="printing" title={t("printing.title")}>
                    <div className={PROSE}>
                        <p>{t("printing.p1")}</p>
                        <p>{t("printing.p2")}</p>
                        <p>{t("printing.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="blender" title={t("blender.title")}>
                    <div className={PROSE}>
                        <p>{t("blender.p1")}</p>
                        <p>{t("blender.p2")}</p>
                        <p>{t("blender.p3")}</p>
                        <p>{t("blender.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.p1")}</p>
                        <p>{t("limits.p2")}</p>
                        <p>{t("limits.p3")}</p>
                        <p>{t("limits.p4")}</p>
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
