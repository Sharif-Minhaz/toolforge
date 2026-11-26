import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

/** The FAQ's entries, a literal tuple so every message key it builds is checked. */
const FAQ_ENTRIES = [1, 2, 3, 4, 5, 6] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getPhotoExifFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("photoExif.article");

    return FAQ_ENTRIES.map((entry) => ({
        question: t(`faq.q${entry}`),
        answer: t(`faq.a${entry}`),
    }));
}

export async function PhotoExifArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("photoExif.article"),
        getPhotoExifFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="understanding" title={t("understanding.title")}>
                <div className={PROSE}>
                    <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                    <ArticleExample>{t("understanding.example")}</ArticleExample>
                    <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
