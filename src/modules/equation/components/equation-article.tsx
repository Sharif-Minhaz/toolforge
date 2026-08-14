import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { FORMAT_SAMPLES, NOTATION_KEYS, NOTATION_SAMPLES } from "../domain/samples";

export const EQUATION_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "image", titleKey: "image.title" },
    { id: "notation", titleKey: "notation.title" },
    { id: "pasted", titleKey: "pasted.title" },
    { id: "guesses", titleKey: "guesses.title" },
    { id: "output", titleKey: "output.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getEquationFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("equation.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

export async function EquationArticle() {
    const [t, tFormats, tToc, faqs] = await Promise.all([
        getTranslations("equation.article"),
        getTranslations("equation.formats"),
        getTranslations("equation.toc"),
        getEquationFaqEntries(),
    ]);

    const tocItems: TocItem[] = EQUATION_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>{t("understanding.example")}</ArticleExample>
                        <p>{t("understanding.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="image" title={t("image.title")}>
                    <div className={PROSE}>
                        <p>{t("image.intro")}</p>
                        <p>{t("image.privacy")}</p>
                        <p>{t("image.limits")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="notation" title={t("notation.title")}>
                    <div className={PROSE}>
                        <p>{t("notation.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("notation.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("notation.colWrite")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("notation.colNote")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {NOTATION_KEYS.map((key) => (
                                    <tr key={key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium"
                                        >
                                            {NOTATION_SAMPLES[key]}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`notation.${key}Note`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("notation.note")}</p>
                </ArticleSection>

                <ArticleSection id="pasted" title={t("pasted.title")}>
                    <div className={PROSE}>
                        <p>{t("pasted.intro")}</p>
                        <p>{t("pasted.forms")}</p>
                        <p>{t("pasted.display")}</p>
                        <p>{t("pasted.block")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="guesses" title={t("guesses.title")}>
                    <div className={PROSE}>
                        <p>{t("guesses.intro")}</p>
                        <p>{t.rich("guesses.power", ARTICLE_TAGS)}</p>
                        <p>{t.rich("guesses.fraction", ARTICLE_TAGS)}</p>
                        <p>{t("guesses.bracket")}</p>
                        <p>{t.rich("guesses.settle", ARTICLE_TAGS)}</p>
                        <p>{t("guesses.verify")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="output" title={t("output.title")}>
                    <div className={PROSE}>
                        <p>{t("output.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("output.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("output.colFormat")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("output.colGives")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("output.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {FORMAT_SAMPLES.map(({ format, sample }) => (
                                    <tr key={format} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tFormats(format)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {/* The block form is three lines, and
                                                the line breaks are the point. */}
                                            <pre className="font-mono text-[0.75rem] leading-[1.5] whitespace-pre-wrap">
                                                {sample}
                                            </pre>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`output.${format}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>
                        {t.rich("output.download", ARTICLE_TAGS)}
                    </p>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("useCases.p3")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
