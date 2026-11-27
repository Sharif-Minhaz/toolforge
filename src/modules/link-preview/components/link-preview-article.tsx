import { getTranslations } from "next-intl/server";

import { ArticleExample, ArticleSection, PROSE } from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export async function getLinkPreviewFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("linkPreview.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
    ];
}

export async function LinkPreviewArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("linkPreview.article"),
        getLinkPreviewFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="understanding" title={t("understanding.title")}>
                <div className={PROSE}>
                    <p>{t("understanding.p1")}</p>
                    <p>{t("understanding.p2")}</p>
                    <ArticleExample>{t("understanding.example")}</ArticleExample>
                    <p>{t("understanding.p3")}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
