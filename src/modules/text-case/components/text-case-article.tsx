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
import {
    IDENTIFIER_CASE_NAMES,
    isIdentifierCase,
    MAX_TEXT_CASE_INPUT_LENGTH,
} from "../domain/constants";
import { CASE_SAMPLES } from "../domain/samples";
import { TITLE_SMALL_WORDS } from "../domain/small-words";
import type { TextCase } from "../types";

export const TEXT_CASE_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "cases", titleKey: "cases.title" },
    { id: "options", titleKey: "options.title" },
    { id: "words", titleKey: "words.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * The small-word list as a sentence, and the script it came from. Both are
 * data — a list of English function words reads the same in either locale, and
 * a filename is a filename.
 */
const SMALL_WORDS = [...TITLE_SMALL_WORDS].join(", ");
const TITLE_CASE_REFERENCE = "titlecase.pl";

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getTextCaseFaqEntries(): Promise<FaqEntry[]> {
    const [t, formatter] = await Promise.all([getTranslations("textCase.article"), getFormatter()]);
    const max = formatter.number(MAX_TEXT_CASE_INPUT_LENGTH);

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        {
            question: t("faq.q5"),
            answer: t.markup("faq.a5", PLAIN_TAGS),
            answerNode: t.rich("faq.a5", ARTICLE_TAGS),
        },
        { question: t("faq.q6"), answer: t("faq.a6", { max }) },
    ];
}

export async function TextCaseArticle() {
    const [t, tCases, tToc, faqs] = await Promise.all([
        getTranslations("textCase.article"),
        getTranslations("textCase.cases"),
        getTranslations("textCase.toc"),
        getTextCaseFaqEntries(),
    ]);

    const tocItems: TocItem[] = TEXT_CASE_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    function nameOf(textCase: TextCase): string {
        if (isIdentifierCase(textCase)) {
            return IDENTIFIER_CASE_NAMES[textCase];
        }

        // Narrowed to `ProseCase` above — a literal union, so the message key
        // is checked at compile time.
        return tCases(textCase);
    }

    // A literal union, so every message key below is checked at compile time.
    const optionRows = ["perLine", "acronyms"] as const;

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
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="cases" title={t("cases.title")}>
                    <div className={PROSE}>
                        <p>{t("cases.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("cases.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("cases.colCase")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("cases.colExample")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("cases.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CASE_SAMPLES.map(({ textCase, sample }) => (
                                    <tr key={textCase} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {nameOf(textCase)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {sample}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {textCase === "title"
                                                ? t("cases.titleWhen", { smallWords: SMALL_WORDS })
                                                : t(`cases.${textCase}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("cases.note")}</p>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t("options.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("options.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colOption")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {optionRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`options.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`options.${row}Does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("options.acronymTrap")}</p>
                        <p>{t("options.acronymScope")}</p>
                        <p>{t.rich("options.camelNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="words" title={t("words.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("words.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("words.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("words.p3", ARTICLE_TAGS)}</p>
                        <p>
                            {t("words.p4", {
                                smallWords: SMALL_WORDS,
                                reference: TITLE_CASE_REFERENCE,
                            })}
                        </p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("useCases.p3")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
