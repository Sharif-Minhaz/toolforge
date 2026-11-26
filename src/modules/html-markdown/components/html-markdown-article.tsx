import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getHtmlMarkdownFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("htmlMarkdown.article");

    return [
        {
            question: t("faq.q1"),
            answer: t.markup("faq.a1", PLAIN_TAGS),
            answerNode: t.rich("faq.a1", ARTICLE_TAGS),
        },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        {
            question: t("faq.q5"),
            answer: t.markup("faq.a5", PLAIN_TAGS),
            answerNode: t.rich("faq.a5", ARTICLE_TAGS),
        },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function HtmlMarkdownArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("htmlMarkdown.article"),
        getHtmlMarkdownFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="understanding" title={t("understanding.title")}>
                <div className={PROSE}>
                    <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                    <ArticleExample>{t.rich("understanding.example", ARTICLE_TAGS)}</ArticleExample>
                    <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
