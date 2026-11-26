import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

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
    const [t, faqs] = await Promise.all([
        getTranslations("backgroundRemover.article"),
        getBackgroundRemoverFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="whatItIs" title={t("whatItIs.title")}>
                <div className={PROSE}>
                    <p>{t.rich("whatItIs.p1", ARTICLE_TAGS)}</p>
                    <ArticleExample>{t.rich("whatItIs.example", ARTICLE_TAGS)}</ArticleExample>
                    <p>{t.rich("whatItIs.p2", ARTICLE_TAGS)}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
