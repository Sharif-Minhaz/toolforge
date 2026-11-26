import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE } from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

const FAQ_KEYS = ["text", "server", "doc", "fidelity", "scripts", "charts", "size"] as const;

/** Shared by the FAQ section and the page's structured data, so they cannot drift. */
export async function getPdfConverterFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("pdfConverter.article.faq");

    return FAQ_KEYS.map((key) => ({
        question: t(`${key}.question`),
        answer: t(`${key}.answer`),
    }));
}

export async function PdfConverterArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("pdfConverter.article"),
        getPdfConverterFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="formats" title={t("formats.title")}>
                <div className={PROSE}>
                    <p>{t("formats.p1")}</p>
                    <p>{t("formats.p2")}</p>
                    <p>{t("formats.p3")}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
