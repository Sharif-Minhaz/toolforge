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
export async function getRegexFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("regex.article");

    return (["1", "2", "3", "4", "5", "6"] as const).map((index) => ({
        question: t(`faq.q${index}`),
        answer: t.markup(`faq.a${index}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${index}`, ARTICLE_TAGS),
    }));
}

export async function RegexArticle() {
    const [t, faqs] = await Promise.all([getTranslations("regex.article"), getRegexFaqEntries()]);

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
