import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const BACKGROUND_REMOVER_ARTICLE_SECTIONS = [
    { id: "whatItIs", titleKey: "whatItIs.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "backgrounds", titleKey: "backgrounds.title" },
    { id: "slots", titleKey: "slots.title" },
    { id: "quality", titleKey: "quality.title" },
    { id: "formats", titleKey: "formats.title" },
    { id: "licensing", titleKey: "licensing.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getBackgroundRemoverFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("backgroundRemover.article");

    return [
        { question: t("faq.q1"), answer: t.markup("faq.a1", PLAIN_TAGS) },
        { question: t("faq.q2"), answer: t.markup("faq.a2", PLAIN_TAGS) },
        { question: t("faq.q3"), answer: t.markup("faq.a3", PLAIN_TAGS) },
        { question: t("faq.q4"), answer: t.markup("faq.a4", PLAIN_TAGS) },
        { question: t("faq.q5"), answer: t.markup("faq.a5", PLAIN_TAGS) },
        { question: t("faq.q6"), answer: t.markup("faq.a6", PLAIN_TAGS) },
        { question: t("faq.q7"), answer: t.markup("faq.a7", PLAIN_TAGS) },
        { question: t("faq.q8"), answer: t.markup("faq.a8", PLAIN_TAGS) },
    ];
}

export async function BackgroundRemoverArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("backgroundRemover.article"),
        getTranslations("backgroundRemover.toc"),
        getBackgroundRemoverFaqEntries(),
    ]);

    const tocItems: TocItem[] = BACKGROUND_REMOVER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Literal unions, so every message key built below is checked at compile
    // time — `docs/internationalization.md`.
    const controlRows = [
        "source",
        "quality",
        "remove",
        "blur",
        "topics",
        "photo",
        "upload",
        "color",
        "transparent",
        "format",
        "compare",
        "strip",
    ] as const;

    const formatRows = ["png", "jpeg", "webp"] as const;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="whatItIs" title={t("whatItIs.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("whatItIs.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>{t.rich("whatItIs.example", ARTICLE_TAGS)}</ArticleExample>
                        <p>{t.rich("whatItIs.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("howItWorks.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p4", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p5", ARTICLE_TAGS)}</p>
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
                                            {t.rich(`controls.${row}Does`, ARTICLE_TAGS)}
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
                        <p>{t("controls.lockedNote")}</p>
                        <p>{t("controls.tabNote")}</p>
                        <p>{t("controls.qualityNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="backgrounds" title={t("backgrounds.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("backgrounds.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("backgrounds.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("backgrounds.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("backgrounds.p4", ARTICLE_TAGS)}</p>
                        <p>{t.rich("backgrounds.p5", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="slots" title={t("slots.title")}>
                    <div className={PROSE}>
                        <p>{t("slots.p1")}</p>
                        <p>{t("slots.p2")}</p>
                        <p>{t("slots.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="quality" title={t("quality.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("quality.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("quality.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("quality.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("quality.p4", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="formats" title={t("formats.title")}>
                    <div className={PROSE}>
                        <p>{t("formats.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("formats.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colFormat")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colAlpha")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {formatRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-medium whitespace-nowrap"
                                        >
                                            {t(`formats.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                                            {t(`formats.${row}Alpha`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`formats.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("formats.note", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="licensing" title={t("licensing.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("licensing.p1", ARTICLE_TAGS)}</p>
                        <p>{t("licensing.p2")}</p>
                        <p>{t("licensing.p3")}</p>
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
                        <p>{t.rich("privacy.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("privacy.p2", ARTICLE_TAGS)}</p>
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
