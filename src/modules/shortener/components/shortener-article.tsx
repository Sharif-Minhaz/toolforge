import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import {
    ALIAS_LENGTH,
    EDIT_TOKEN_LENGTH,
    MAX_TARGET_URL_LENGTH,
    PASSWORD_LENGTH,
    SLUG_LENGTH,
} from "@/modules/short-links/domain/constants";
import { MAX_HISTORY_ENTRIES } from "../domain/constants";

export const SHORTENER_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "options", titleKey: "options.title" },
    { id: "editing", titleKey: "editing.title" },
    { id: "history", titleKey: "history.title" },
    { id: "safety", titleKey: "safety.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getShortenerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("shortener.article");

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

/** Every control on the form gets a row, or the table is not documentation. */
const OPTION_ROWS = ["target", "alias", "password", "startsAt", "expiresAt"] as const;

export async function ShortenerArticle() {
    const [t, tOptions, tToc, faqs] = await Promise.all([
        getTranslations("shortener.article"),
        getTranslations("shortener.article.options.rows"),
        getTranslations("shortener.toc"),
        getShortenerFaqEntries(),
    ]);

    const tocItems: TocItem[] = SHORTENER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="min-w-0 xl:order-2">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t("understanding.p1", { length: SLUG_LENGTH })}</p>
                        <p>{t("understanding.p2")}</p>
                        <p>{t("understanding.p3", { limit: MAX_TARGET_URL_LENGTH })}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t("options.p1")}</p>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[36rem] border-collapse text-left text-[0.875rem]">
                            <thead>
                                <tr className="border-border/70 text-muted-foreground border-b">
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("options.columnOption")}
                                    </th>
                                    <th scope="col" className="py-2 pr-4 font-medium">
                                        {t("options.columnWhat")}
                                    </th>
                                    <th scope="col" className="py-2 font-medium">
                                        {t("options.columnWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="text-muted-foreground">
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row} className="border-border/40 border-b align-top">
                                        <th
                                            scope="row"
                                            className="text-foreground py-2.5 pr-4 font-medium whitespace-nowrap"
                                        >
                                            {tOptions(`${row}.name`)}
                                        </th>
                                        <td className="py-2.5 pr-4 leading-6">
                                            {tOptions(`${row}.what`)}
                                        </td>
                                        <td className="py-2.5 leading-6">
                                            {tOptions(`${row}.when`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`${PROSE} mt-6`}>
                        <p>
                            {t("options.aliasRules", {
                                min: ALIAS_LENGTH.min,
                                max: ALIAS_LENGTH.max,
                            })}
                        </p>
                        <p>{t("options.passwordRules", { min: PASSWORD_LENGTH.min })}</p>
                        <p>{t("options.scheduleRules")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="editing" title={t("editing.title")}>
                    <div className={PROSE}>
                        <p>{t("editing.p1")}</p>
                        <p>{t("editing.p2", { length: EDIT_TOKEN_LENGTH })}</p>
                        <p>{t("editing.p3")}</p>
                    </div>

                    <ul className={`${PROSE_TEXT} mt-4 flex list-disc flex-col gap-2 pl-5`}>
                        <li>{t("editing.point1")}</li>
                        <li>{t("editing.point2")}</li>
                        <li>{t("editing.point3")}</li>
                    </ul>
                </ArticleSection>

                <ArticleSection id="history" title={t("history.title")}>
                    <div className={PROSE}>
                        <p>{t("history.p1", { limit: MAX_HISTORY_ENTRIES })}</p>
                        <p>{t("history.p2")}</p>
                        <p>{t("history.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="safety" title={t("safety.title")}>
                    <div className={PROSE}>
                        <p>{t("safety.p1")}</p>
                        <p>{t("safety.p2")}</p>
                        <p>{t("safety.p3")}</p>
                    </div>

                    <ul className={`${PROSE_TEXT} mt-4 flex list-disc flex-col gap-2 pl-5`}>
                        <li>{t("safety.point1")}</li>
                        <li>{t("safety.point2")}</li>
                        <li>{t("safety.point3")}</li>
                    </ul>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
