import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { IMAGE_VERDICT_LABELS } from "../types";

export const AI_IMAGE_DETECTOR_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "reading", titleKey: "reading.title" },
    { id: "facts", titleKey: "facts.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Mirrors the facts panel in the workbench, so the table documents what ships. */
const FACT_ROWS = ["name", "size", "type", "dimensions"] as const;

const CONTROL_ROWS = ["upload", "analyse", "clear", "copy", "download", "challenge"] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getAiImageDetectorFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("aiImageDetector.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function AiImageDetectorArticle() {
    const [t, tToc, tLabels, faqs] = await Promise.all([
        getTranslations("aiImageDetector.article"),
        getTranslations("aiImageDetector.toc"),
        getTranslations("aiImageDetector.labels"),
        getAiImageDetectorFaqEntries(),
    ]);

    const tocItems: TocItem[] = AI_IMAGE_DETECTOR_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t("understanding.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="reading" title={t("reading.title")}>
                    <div className={PROSE}>
                        <p>{t("reading.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("reading.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reading.colLabel")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reading.colMeans")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reading.colDo")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {IMAGE_VERDICT_LABELS.map((label) => (
                                    <tr key={label} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tLabels(label)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`reading.${label}Means`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`reading.${label}Do`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("reading.bandsNote")}</p>
                </ArticleSection>

                <ArticleSection id="facts" title={t("facts.title")}>
                    <div className={PROSE}>
                        <p>{t("facts.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("facts.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("facts.colFact")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("facts.colMeans")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("facts.colWatchFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {FACT_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`facts.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`facts.${row}Means`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`facts.${row}WatchFor`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("facts.note")}</p>
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
                        <p>{t("controls.formatNote")}</p>
                        <p>{t("controls.challengeNote")}</p>
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
                        <p>{t("privacy.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
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
