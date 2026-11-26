import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

/**
 * The walk-through, in order.
 *
 * The studio is a route tree rather than a single workbench, so the one thing
 * this article has to carry that a tool page's does not is *sequence* — which
 * screen comes after which, and what each one is for. Everything else here is
 * reference material somebody arrives at already knowing what they want.
 */
const FLOW_STEPS = [
    "workspace",
    "recoveryKey",
    "server",
    "route",
    "response",
    "logic",
    "call",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getMockServerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("mockServer.article");

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

export async function MockServerArticle() {
    const [t, faqs] = await Promise.all([
        getTranslations("mockServer.article"),
        getMockServerFaqEntries(),
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
            <ArticleSection id="flow" title={t("flow.title")}>
                <p className={PROSE_TEXT}>{t("flow.intro")}</p>

                <div className="mt-4">
                    <ArticleExample>{t.rich("flow.example", ARTICLE_TAGS)}</ArticleExample>
                </div>

                <ol className="mt-5 flex flex-col gap-4">
                    {FLOW_STEPS.map((step, index) => (
                        <li key={step} className="flex gap-3.5">
                            <span
                                aria-hidden="true"
                                className="bg-card text-muted-foreground ring-border/70 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ring-1 ring-inset"
                            >
                                {index + 1}
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-foreground text-[0.9375rem] leading-6 font-medium">
                                    {t(`flow.${step}Title`)}
                                </h3>
                                <p className={`mt-1 ${PROSE_TEXT}`}>{t(`flow.${step}Body`)}</p>
                            </div>
                        </li>
                    ))}
                </ol>

                <p className={`mt-5 ${PROSE_TEXT}`}>{t("flow.outro")}</p>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
