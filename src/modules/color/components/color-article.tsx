import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { TAILWIND_VERSION } from "../domain/tailwind-palette";

export const COLOR_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "models", titleKey: "models.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "contrast", titleKey: "contrast.title" },
    { id: "scales", titleKey: "scales.title" },
    { id: "palettes", titleKey: "palettes.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getColorFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("color.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

const MODEL_ROWS = ["hex", "rgb", "hsl", "hsv", "cmyk", "oklch"] as const;

const CONTROL_ROWS = [
    "input",
    "square",
    "hue",
    "alpha",
    "notation",
    "hexCasing",
    "random",
    "eyedropper",
    "download",
] as const;

export async function ColorArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("color.article"),
        getTranslations("color.toc"),
        getColorFaqEntries(),
    ]);

    const tocItems: TocItem[] = COLOR_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="models" title={t("models.title")}>
                    <div className={PROSE}>
                        <p>{t("models.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("models.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("models.colModel")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("models.colChannels")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("models.colBestFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {MODEL_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`models.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem]">
                                            {t(`models.${row}Channels`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`models.${row}BestFor`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("models.gamutNote")}</p>
                        <p>{t("models.cmykNote")}</p>
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
                        <p>{t("controls.alphaNote")}</p>
                        <p>{t("controls.notationNote")}</p>
                        <p>{t("controls.clampNote")}</p>
                        <p>{t("controls.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="contrast" title={t("contrast.title")}>
                    <div className={PROSE}>
                        <p>{t("contrast.p1")}</p>
                        <p>{t("contrast.p2")}</p>
                        <p>{t("contrast.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="scales" title={t("scales.title")}>
                    <div className={PROSE}>
                        <p>{t("scales.p1")}</p>
                        <p>{t("scales.p2")}</p>
                        <p>{t("scales.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="palettes" title={t("palettes.title")}>
                    <div className={PROSE}>
                        <p>{t("palettes.p1", { version: TAILWIND_VERSION })}</p>
                        <p>{t("palettes.p2")}</p>
                        <p>{t("palettes.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                        <p>{t("useCases.p3")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("useCases.close")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
