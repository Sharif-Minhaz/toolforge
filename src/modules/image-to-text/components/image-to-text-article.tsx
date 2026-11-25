import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MAX_IMAGES } from "../domain/constants";
import { LANGUAGE_ENDONYMS, LANGUAGE_TAGS } from "../domain/languages";
import { OCR_LANGUAGES } from "../types";

export const IMAGE_TO_TEXT_ARTICLE_SECTIONS = [
    { id: "whatItIs", titleKey: "whatItIs.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "languages", titleKey: "languages.title" },
    { id: "tips", titleKey: "tips.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

const CONTROL_ROWS = ["language", "layout", "readAgain", "copy", "clear"] as const;

const TIP_KEYS = ["crop", "sharp", "flat", "contrast", "oneLanguage"] as const;

const FAQ_KEYS = [
    "uploaded",
    "firstRun",
    "handwriting",
    "nonsense",
    "mixed",
    "several",
    "pdf",
] as const;

const TABLE_FRAME = "ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset";
const TABLE = "w-full min-w-160 border-collapse text-left text-sm";
const HEAD_CELL = "px-4 py-2.5 font-medium";
const ROW_HEAD = "text-primary px-4 py-3 font-medium whitespace-nowrap";
const CELL = "text-muted-foreground px-4 py-3";

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getImageToTextFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("imageToText.article.faq.items");

    return FAQ_KEYS.map((key) => ({
        question: t(`${key}.question`),
        answer: t(`${key}.answer`, { count: MAX_IMAGES }),
    }));
}

export async function ImageToTextArticle() {
    const [t, tToc, tLanguages, faqs] = await Promise.all([
        getTranslations("imageToText.article"),
        getTranslations("imageToText.toc"),
        getTranslations("imageToText.languages"),
        getImageToTextFaqEntries(),
    ]);

    const tocItems: TocItem[] = IMAGE_TO_TEXT_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-10 xl:order-1">
                <ArticleSection id="whatItIs" title={t("whatItIs.title")}>
                    <div className={PROSE}>
                        <p>{t("whatItIs.p1")}</p>
                        <ArticleExample>{t.rich("whatItIs.example", ARTICLE_TAGS)}</ArticleExample>
                        <p>{t("whatItIs.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("howItWorks.p1", ARTICLE_TAGS)}</p>
                        <p>{t("howItWorks.p2")}</p>
                        <p>{t("howItWorks.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="controls" title={t("controls.title")}>
                    <div className={PROSE}>
                        <p>{t("controls.intro")}</p>
                    </div>
                    <div className={TABLE_FRAME}>
                        <table className={TABLE}>
                            <caption className="sr-only">{t("controls.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("controls.headControl")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("controls.headWhat")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("controls.headWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CONTROL_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th scope="row" className={ROW_HEAD}>
                                            {t(`controls.rows.${row}.name`)}
                                        </th>
                                        <td className={CELL}>{t(`controls.rows.${row}.what`)}</td>
                                        <td className={CELL}>{t(`controls.rows.${row}.when`)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("controls.p2", { ...ARTICLE_TAGS, count: MAX_IMAGES })}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="languages" title={t("languages.title")}>
                    <div className={PROSE}>
                        <p>{t("languages.p1")}</p>
                    </div>
                    <div className={TABLE_FRAME}>
                        <table className={TABLE}>
                            <caption className="sr-only">{t("languages.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("languages.headLanguage")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("languages.headScript")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("languages.headNotes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {OCR_LANGUAGES.map((code) => (
                                    <tr key={code} className="align-top">
                                        <th scope="row" className={ROW_HEAD}>
                                            {tLanguages(code)}
                                            <span
                                                lang={LANGUAGE_TAGS[code]}
                                                className="text-muted-foreground block text-[0.8125rem] font-normal"
                                            >
                                                {LANGUAGE_ENDONYMS[code]}
                                            </span>
                                        </th>
                                        <td className={CELL}>
                                            {t(`languages.rows.${code}.script`)}
                                        </td>
                                        <td className={CELL}>
                                            {t(`languages.rows.${code}.notes`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="tips" title={t("tips.title")}>
                    <ul className={`${PROSE} list-disc pl-5`}>
                        {TIP_KEYS.map((key) => (
                            <li key={key}>{t(`tips.items.${key}`)}</li>
                        ))}
                    </ul>
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
