import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const TIMESTAMP_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "formats", titleKey: "formats.title" },
    { id: "zones", titleKey: "zones.title" },
    { id: "options", titleKey: "options.title" },
    { id: "precision", titleKey: "precision.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getTimestampFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("timestamp.article");

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

/**
 * Examples are data, not copy: they are the literal strings the parser accepts,
 * so they stay identical in both locales. Every one names the same instant —
 * 2026-07-29T12:00:00Z — so the table reads as one row per spelling.
 */
const FORMAT_ROWS = [
    { key: "epochSeconds", example: "1785326400" },
    { key: "epochMillis", example: "1785326400000" },
    { key: "epochNanos", example: "1785326400000000000" },
    { key: "iso", example: "2026-07-29T12:00:00Z" },
    { key: "isoOffset", example: "2026-07-29T18:00:00+06:00" },
    { key: "isoWeek", example: "2026-W31-3" },
    { key: "rfc", example: "Wed, 29 Jul 2026 12:00:00 GMT" },
    { key: "dateText", example: "July 29, 2026 12:00 PM" },
    { key: "uuid", example: "019fadbe-f200-7abc-…" },
    { key: "objectId", example: "6a69eb40a1b2c3d4e5f60718" },
    { key: "filetime", example: "134298000000000000" },
    { key: "excel", example: "46232.5" },
] as const;

const OPTION_ROWS = ["unit", "inputZone", "pinnedZones", "clock"] as const;

export async function TimestampArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("timestamp.article"),
        getTranslations("timestamp.toc"),
        getTimestampFaqEntries(),
    ]);

    const tocItems: TocItem[] = TIMESTAMP_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="min-w-0 xl:order-2">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="understanding" title={t("understanding.title")}>
                    <div className={PROSE}>
                        <p>{t("understanding.p1")}</p>
                        <p>{t("understanding.p2")}</p>
                        <p>{t("understanding.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="formats" title={t("formats.title")}>
                    <div className={PROSE}>
                        <p>{t("formats.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("formats.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colFormat")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colExample")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("formats.colNotes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {FORMAT_ROWS.map((row) => (
                                    <tr key={row.key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`formats.${row.key}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {row.example}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`formats.${row.key}Notes`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("formats.ambiguity")}</p>
                        <p>{t("formats.detection")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="zones" title={t("zones.title")}>
                    <div className={PROSE}>
                        <p>{t("zones.p1")}</p>
                        <p>{t("zones.p2")}</p>
                        <p>{t("zones.p3")}</p>
                        <p>{t("zones.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t("options.intro")}</p>
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
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`options.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("options.zoneNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="precision" title={t("precision.title")}>
                    <div className={PROSE}>
                        <p>{t("precision.p1")}</p>
                        <p>{t("precision.p2")}</p>
                        <p>{t("precision.p3")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("precision.year2038")}</p>
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
