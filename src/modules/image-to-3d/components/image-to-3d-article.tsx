import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

import { GENERATION_LIMIT_PER_ADDRESS, GENERATION_LIMIT_PER_DEPLOYMENT } from "../domain/constants";

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getImageTo3dFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("imageTo3d.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        {
            question: t("faq.q3"),
            // Read from the limiter's own constants, so the article can never
            // promise a number the counter does not enforce.
            answer: t("faq.a3", {
                perVisitor: GENERATION_LIMIT_PER_ADDRESS,
                perSite: GENERATION_LIMIT_PER_DEPLOYMENT,
            }),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
    ];
}

export async function ImageTo3dArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("imageTo3d.article"),
        getImageTo3dFaqEntries(),
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
