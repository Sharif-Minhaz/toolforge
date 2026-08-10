import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const BSON_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "extendedJson", titleKey: "extendedJson.title" },
    { id: "toonForms", titleKey: "toonForms.title" },
    { id: "options", titleKey: "options.title" },
    { id: "gotchas", titleKey: "gotchas.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * The Extended JSON table, as data.
 *
 * Type names and wrapper literals are proper names — data rather than copy —
 * so they stay out of the message catalogue and cannot be translated into
 * something that no longer parses. Only the last column is prose.
 */
const EJSON_ROWS = [
    {
        id: "Double",
        type: "Double",
        canonical: '{"$numberDouble":"1.0"}',
        relaxed: "1",
        costKey: "costDouble",
    },
    {
        id: "Int64",
        type: "Int64",
        canonical: '{"$numberLong":"9007199254740993"}',
        relaxed: "9007199254740992",
        costKey: "costInt64",
    },
    {
        id: "Date",
        type: "Date",
        canonical: '{"$date":{"$numberLong":"1577934245678"}}',
        relaxed: '{"$date":"2020-01-02T03:04:05.678Z"}',
        costKey: "costDate",
    },
    {
        id: "ObjectId",
        type: "ObjectId",
        canonical: '{"$oid":"64b7c0f0e1a2b3c4d5e6f708"}',
        relaxed: '{"$oid":"64b7c0f0e1a2b3c4d5e6f708"}',
        costKey: "costObjectId",
    },
    {
        id: "Decimal128",
        type: "Decimal128",
        canonical: '{"$numberDecimal":"19.99"}',
        relaxed: '{"$numberDecimal":"19.99"}',
        costKey: "costDecimal",
    },
    {
        id: "Binary",
        type: "Binary",
        canonical: '{"$binary":{"base64":"AQID","subType":"00"}}',
        relaxed: '{"$binary":{"base64":"AQID","subType":"00"}}',
        costKey: "costBinary",
    },
] as const;

/**
 * TOON's four forms, with the shape each one produces. Every example is
 * verbatim encoder output, not an illustration of it.
 */
const TOON_FORM_ROWS = [
    { id: "Inline", nameKey: "formInline", whenKey: "whenInline", example: "tags[2]: red,blue" },
    {
        id: "Tabular",
        nameKey: "formTabular",
        whenKey: "whenTabular",
        example: "users[2]{id,name}:\n  1,Ada\n  2,Bob",
    },
    {
        id: "Keyed",
        nameKey: "formKeyed",
        whenKey: "whenKeyed",
        example: "envs[2:]{region,replicas}:\n  production: eu-1,6\n  staging: eu-1,2",
    },
    {
        id: "List",
        nameKey: "formList",
        whenKey: "whenList",
        example: "items[2]:\n  - 1\n  - name: Ada",
    },
] as const;

/** Option rows take their names from the workbench, so the two cannot drift. */
const OPTION_ROWS = [
    { id: "encoding", labelKey: "encoding", doesKey: "encodingDoes", whenKey: "encodingWhen" },
    { id: "ejson", labelKey: "ejson", doesKey: "ejsonDoes", whenKey: "ejsonWhen" },
    {
        id: "jsonIndent",
        labelKey: "jsonIndent",
        doesKey: "jsonIndentDoes",
        whenKey: "jsonIndentWhen",
    },
    { id: "delimiter", labelKey: "delimiter", doesKey: "delimiterDoes", whenKey: "delimiterWhen" },
    {
        id: "toonIndent",
        labelKey: "toonIndent",
        doesKey: "toonIndentDoes",
        whenKey: "toonIndentWhen",
    },
    { id: "toonStrict", labelKey: "toonStrict", doesKey: "strictDoes", whenKey: "strictWhen" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getBsonFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("bson.article");

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

export async function BsonArticle() {
    const [t, tWorkbench, tToc, faqs] = await Promise.all([
        getTranslations("bson.article"),
        getTranslations("bson.workbench"),
        getTranslations("bson.toc"),
        getBsonFaqEntries(),
    ]);

    const tocItems: TocItem[] = BSON_ARTICLE_SECTIONS.map((section) => ({
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
                        <ArticleExample>
                            {t.rich("understanding.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="extendedJson" title={t("extendedJson.title")}>
                    <div className={PROSE}>
                        <p>{t("extendedJson.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("extendedJson.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("extendedJson.colType")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("extendedJson.colCanonical")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("extendedJson.colRelaxed")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("extendedJson.colCost")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {EJSON_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.type}
                                        </th>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-key text-[0.75rem] break-all">
                                                {row.canonical}
                                            </code>
                                        </td>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-string text-[0.75rem] break-all">
                                                {row.relaxed}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {/* Every key comes from a literal
                                                union, so this is checked at
                                                compile time. */}
                                            {t(`extendedJson.${row.costKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("extendedJson.outro1")}</p>
                        <p>{t("extendedJson.outro2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="toonForms" title={t("toonForms.title")}>
                    <div className={PROSE}>
                        <p>{t("toonForms.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("toonForms.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("toonForms.colForm")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("toonForms.colWhen")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("toonForms.colLooks")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {TOON_FORM_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`toonForms.${row.nameKey}`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`toonForms.${row.whenKey}`)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <pre className="text-syntax-string overflow-x-auto text-[0.75rem] leading-5">
                                                {row.example}
                                            </pre>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("toonForms.outro")}</p>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className="ring-border/80 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
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
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tWorkbench(row.labelKey)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row.doesKey}`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row.whenKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("options.outro")}</p>
                </ArticleSection>

                <ArticleSection id="gotchas" title={t("gotchas.title")}>
                    <div className={PROSE}>
                        <p>{t("gotchas.p1")}</p>
                        <p>{t("gotchas.p2")}</p>
                        <p>{t("gotchas.p3")}</p>
                        <p>{t("gotchas.p4")}</p>
                        <p>{t("gotchas.p5")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
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
