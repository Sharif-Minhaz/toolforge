import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { CONVERSION_TARGETS } from "../types";

export const IMAGE_CONVERTER_ARTICLE_SECTIONS = [
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "targets", titleKey: "targets.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "favicon", titleKey: "favicon.title" },
    { id: "icons", titleKey: "icons.title" },
    { id: "transparency", titleKey: "transparency.title" },
    { id: "quality", titleKey: "quality.title" },
    { id: "metadata", titleKey: "metadata.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getImageConverterFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("imageConverter.article");

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

export async function ImageConverterArticle() {
    const [t, tTargets, tToc, faqs] = await Promise.all([
        getTranslations("imageConverter.article"),
        getTranslations("imageConverter.targets"),
        getTranslations("imageConverter.toc"),
        getImageConverterFaqEntries(),
    ]);

    const tocItems: TocItem[] = IMAGE_CONVERTER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // A literal union, so every message key below is checked at compile time.
    const controlRows = [
        "target",
        "quality",
        "resize",
        "background",
        "sizes",
        "convert",
        "redo",
        "download",
        "downloadAll",
        "remove",
        "clear",
    ] as const;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("howItWorks.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            {t.rich("howItWorks.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t("howItWorks.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="targets" title={t("targets.title")}>
                    <div className={PROSE}>
                        <p>{t("targets.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("targets.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("targets.colTarget")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("targets.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("targets.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CONVERSION_TARGETS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-medium whitespace-nowrap"
                                        >
                                            {tTargets(row)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`targets.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`targets.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("targets.note1")}</p>
                        <p>{t("targets.note2")}</p>
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
                        <p>{t("controls.orderNote")}</p>
                        <p>{t("controls.staleNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="favicon" title={t("favicon.title")}>
                    <div className={PROSE}>
                        <p>{t("favicon.p1")}</p>
                        <p>{t("favicon.p2")}</p>
                        <p>{t("favicon.p3")}</p>
                        <p>{t("favicon.p4")}</p>
                        <p>{t("favicon.p5")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="icons" title={t("icons.title")}>
                    <div className={PROSE}>
                        <p>{t("icons.p1")}</p>
                        <p>{t("icons.p2")}</p>
                        <p>{t("icons.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="transparency" title={t("transparency.title")}>
                    <div className={PROSE}>
                        <p>{t("transparency.p1")}</p>
                        <p>{t("transparency.p2")}</p>
                        <p>{t("transparency.p3")}</p>
                        <p>{t("transparency.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="quality" title={t("quality.title")}>
                    <div className={PROSE}>
                        <p>{t("quality.p1")}</p>
                        <p>{t("quality.p2")}</p>
                        <p>{t("quality.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="metadata" title={t("metadata.title")}>
                    <div className={PROSE}>
                        <p>{t("metadata.p1")}</p>
                        <p>{t("metadata.p2")}</p>
                        <p>{t("metadata.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.p1")}</p>
                        <p>{t("limits.p2")}</p>
                        <p>{t("limits.p3")}</p>
                        <p>{t.rich("limits.codecLoading", ARTICLE_TAGS)}</p>
                    </div>
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
