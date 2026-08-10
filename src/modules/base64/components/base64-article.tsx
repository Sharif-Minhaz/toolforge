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

export const BASE64_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "why", titleKey: "why.title" },
    { id: "variants", titleKey: "variants.title" },
    { id: "options", titleKey: "options.title" },
    { id: "howItWorks", titleKey: "howItWorks.title" },
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
export async function getBase64FaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("base64.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        {
            question: t("faq.q4"),
            answer: t.markup("faq.a4", PLAIN_TAGS),
            answerNode: t.rich("faq.a4", ARTICLE_TAGS),
        },
        {
            question: t("faq.q5"),
            answer: t.markup("faq.a5", PLAIN_TAGS),
            answerNode: t.rich("faq.a5", ARTICLE_TAGS),
        },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function Base64Article() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("base64.article"),
        getTranslations("base64.toc"),
        getBase64FaqEntries(),
    ]);

    const tocItems: TocItem[] = BASE64_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    const optionRows = [
        "charset",
        "newline",
        "perLine",
        "urlSafe",
        "padding",
        "wrap",
        "dataUri",
    ] as const;

    const variantRows = [
        {
            variant: "standard",
            alphabet: t("variants.standardAlphabet"),
            padding: t("variants.standardPadding"),
            bestFor: t("variants.standardBestFor"),
        },
        {
            variant: "base64url",
            alphabet: t("variants.urlSafeAlphabet"),
            padding: t("variants.urlSafePadding"),
            bestFor: t("variants.urlSafeBestFor"),
        },
        {
            variant: "data URI",
            alphabet: t("variants.dataUriAlphabet"),
            padding: t("variants.dataUriPadding"),
            bestFor: t("variants.dataUriBestFor"),
        },
    ];

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            {t.rich("understanding.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="why" title={t("why.title")}>
                    <div className={PROSE}>
                        <p>{t("why.p1")}</p>
                        <p>{t("why.p2")}</p>
                        <p>{t("why.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="variants" title={t("variants.title")}>
                    <div className={PROSE}>
                        <p>{t("variants.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("variants.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("variants.colVariant")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("variants.colAlphabet")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("variants.colPadding")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("variants.colBestFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {variantRows.map((row) => (
                                    <tr key={row.variant} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium"
                                        >
                                            {row.variant}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem]">
                                            {row.alphabet}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.padding}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.bestFor}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>
                        {t.rich("variants.others", ARTICLE_TAGS)}
                    </p>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("options.intro", ARTICLE_TAGS)}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("options.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colOption")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {optionRows.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`options.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`options.${row}Does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`options.${row}When`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("options.charsetNote", ARTICLE_TAGS)}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("howItWorks.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("howItWorks.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t.rich("useCases.p2", ARTICLE_TAGS)}</p>
                        <p>{t("useCases.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
