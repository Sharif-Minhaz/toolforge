import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getWatermarkRemoverFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("watermarkRemover.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
        { question: t("faq.q9"), answer: t("faq.a9") },
    ];
}

export async function WatermarkRemoverArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("watermarkRemover.article"),
        getWatermarkRemoverFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                <div className={PROSE}>
                    <p>{t("howItWorks.p1")}</p>
                    <ArticleExample>{t.rich("howItWorks.example", ARTICLE_TAGS)}</ArticleExample>
                    <p>{t("howItWorks.p2")}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
