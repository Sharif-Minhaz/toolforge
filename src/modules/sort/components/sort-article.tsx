import { getFormatter, getTranslations } from "next-intl/server";

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
import { MAX_SORT_INPUT_LENGTH, MAX_SORT_ITEMS } from "../domain/constants";
import { BULLET_SAMPLES, NUMBER_SAMPLES } from "../domain/samples";
import { SORT_KEYS, SPLIT_MODES } from "../types";

export const SORT_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "splitting", titleKey: "splitting.title" },
    { id: "ordering", titleKey: "ordering.title" },
    { id: "formatting", titleKey: "formatting.title" },
    { id: "cleanup", titleKey: "cleanup.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** A literal tuple, so every `${row}Label` below is checked at compile time. */
const CLEANUP_ROWS = ["trim", "removeEmpty", "duplicates", "markers", "case"] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getSortFaqEntries(): Promise<FaqEntry[]> {
    const [t, formatter] = await Promise.all([getTranslations("sort.article"), getFormatter()]);

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        {
            question: t("faq.q6"),
            answer: t("faq.a6", {
                maxCharacters: formatter.number(MAX_SORT_INPUT_LENGTH),
                maxItems: formatter.number(MAX_SORT_ITEMS),
            }),
        },
    ];
}

export async function SortArticle() {
    const [t, tModes, tKeys, tBullets, tNumbers, tWorkbench, tToc, faqs] = await Promise.all([
        getTranslations("sort.article"),
        getTranslations("sort.splitModes"),
        getTranslations("sort.sortKeys"),
        getTranslations("sort.bulletStyles"),
        getTranslations("sort.numberStyles"),
        getTranslations("sort.workbench"),
        getTranslations("sort.toc"),
        getSortFaqEntries(),
    ]);

    const tocItems: TocItem[] = SORT_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>{t("understanding.example")}</ArticleExample>
                        <p>{t("understanding.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="splitting" title={t("splitting.title")}>
                    <div className={PROSE}>
                        <p>{t("splitting.p1")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("splitting.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("splitting.colMode")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("splitting.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("splitting.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SPLIT_MODES.map((mode) => (
                                    <tr key={mode} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tModes(mode)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`splitting.${mode}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`splitting.${mode}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("splitting.p2")}</p>
                        <p>{t("splitting.p3")}</p>
                        <p>{t("splitting.p4")}</p>
                        <p>{t("splitting.p5")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="ordering" title={t("ordering.title")}>
                    <div className={PROSE}>
                        <p>{t("ordering.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("ordering.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("ordering.colKey")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("ordering.colOrders")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("ordering.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SORT_KEYS.map((key) => (
                                    <tr key={key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tKeys(key)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {t(`ordering.${key}Orders`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`ordering.${key}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("ordering.note")}</p>
                </ArticleSection>

                <ArticleSection id="formatting" title={t("formatting.title")}>
                    <div className={PROSE}>
                        <p>{t("formatting.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("formatting.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formatting.colStyle")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formatting.colExample")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formatting.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {BULLET_SAMPLES.map(({ style, sample }) => (
                                    <tr key={style} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tBullets(style)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {sample}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`formatting.${style}When`)}
                                        </td>
                                    </tr>
                                ))}
                                {NUMBER_SAMPLES.map(({ style, sample }) => (
                                    <tr key={style} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tNumbers(style)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {sample}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`formatting.${style}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("formatting.note")}</p>
                </ArticleSection>

                <ArticleSection id="cleanup" title={t("cleanup.title")}>
                    <div className={PROSE}>
                        <p>{t("cleanup.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("cleanup.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("cleanup.colOption")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("cleanup.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("cleanup.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CLEANUP_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            {tWorkbench(`${row}Label`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`cleanup.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`cleanup.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("cleanup.note")}</p>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t.rich("useCases.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
