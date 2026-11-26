import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MAX_IMAGES } from "../domain/constants";

const FAQ_KEYS = [
    "uploaded",
    "firstRun",
    "handwriting",
    "nonsense",
    "mixed",
    "several",
    "pdf",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getImageToTextFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("imageToText.article.faq.items");

    return FAQ_KEYS.map((key) => ({
        question: t(`${key}.question`),
        answer: t(`${key}.answer`, { count: MAX_IMAGES }),
    }));
}

export async function ImageToTextArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("imageToText.article"),
        getImageToTextFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-10">
            <ArticleSection id="whatItIs" title={t("whatItIs.title")}>
                <div className={PROSE}>
                    <p>{t("whatItIs.p1")}</p>
                    <ArticleExample>{t.rich("whatItIs.example", ARTICLE_TAGS)}</ArticleExample>
                    <p>{t("whatItIs.p2")}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
