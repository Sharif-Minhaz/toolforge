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
export async function getJsonFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("json.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
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
        {
            question: t("faq.q4"),
            answer: t.markup("faq.a4", PLAIN_TAGS),
            answerNode: t.rich("faq.a4", ARTICLE_TAGS),
        },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

export async function JsonArticle() {
    const [t, faqs] = await Promise.all([getTranslations("json.article"), getJsonFaqEntries()]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="understanding" title={t("understanding.title")}>
                <div className={PROSE}>
                    <p>{t("understanding.p1")}</p>
                    <ArticleExample>{t.rich("understanding.example", ARTICLE_TAGS)}</ArticleExample>
                    <p>{t("understanding.p2")}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
