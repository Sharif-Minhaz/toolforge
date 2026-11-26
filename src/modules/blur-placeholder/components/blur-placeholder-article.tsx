import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getBlurPlaceholderFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("blurPlaceholder.article");

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

export async function BlurPlaceholderArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("blurPlaceholder.article"),
        getBlurPlaceholderFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="whatItIs" title={t("whatItIs.title")}>
                <div className={PROSE}>
                    <p>{t("whatItIs.p1")}</p>
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
