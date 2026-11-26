import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

const FAQ_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getTextToSpeechFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("textToSpeech.article");

    return FAQ_KEYS.map((key) => ({
        question: t(`faq.q${key}`),
        answer: t.markup(`faq.a${key}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${key}`, ARTICLE_TAGS),
    }));
}

export async function TextToSpeechArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("textToSpeech.article"),
        getTextToSpeechFaqEntries(),
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
