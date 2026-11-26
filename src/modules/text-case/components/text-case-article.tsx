import { getFormatter, getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MAX_TEXT_CASE_INPUT_LENGTH } from "../domain/constants";

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
    const [t, faqs] = await Promise.all([
        getTranslations("textCase.article"),
        getTextCaseFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="understanding" title={t("understanding.title")}>
                <div className={PROSE}>
                    <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                    <ArticleExample>{t("understanding.example")}</ArticleExample>
                    <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
