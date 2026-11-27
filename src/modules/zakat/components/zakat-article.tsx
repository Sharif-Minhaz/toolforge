import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

const FAQ_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getZakatFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("zakat.article");

    return FAQ_KEYS.map((key) => ({ question: t(`faq.q${key}`), answer: t(`faq.a${key}`) }));
}

export async function ZakatArticle() {
    const [t, faqs] = await Promise.all([getTranslations("zakat.article"), getZakatFaqEntries()]);

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
