import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

const FAQ_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/**
 * The FAQ, also fed to `FAQPage` structured data on the page.
 *
 * Exported so the page can emit it as JSON-LD without a second copy of the copy
 * — the same entries a reader sees are the ones a crawler is told about.
 */
export async function getGraphqlServerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("graphqlServer.faq");

    return FAQ_KEYS.map((key) => ({
        question: t(`q${key}`),
        answer: t(`a${key}`),
    }));
}

export async function GraphqlServerArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("graphqlServer.article"),
        getGraphqlServerFaqEntries(),
        ,
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="intro" title={t("introTitle")}>
                <div className={PROSE}>
                    <p>{t("introBody")}</p>
                    <ArticleExample>{t.rich("introExample", ARTICLE_TAGS)}</ArticleExample>
                    <p>{t("introSibling")}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faqTitle")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
