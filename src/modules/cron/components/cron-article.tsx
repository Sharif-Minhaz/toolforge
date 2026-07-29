import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const CRON_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "fields", titleKey: "fields.title" },
    { id: "syntax", titleKey: "syntax.title" },
    { id: "macros", titleKey: "macros.title" },
    { id: "options", titleKey: "options.title" },
    { id: "traps", titleKey: "traps.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getCronFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("cron.article");

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
 * The five columns and what each accepts. Ranges and special characters are
 * data, not copy — `0-59` and `L` mean the same thing in every language.
 */
const FIELD_ROWS = [
    { key: "second", values: "0-59", specials: "* , - / " },
    { key: "minute", values: "0-59", specials: "* , - / " },
    { key: "hour", values: "0-23", specials: "* , - / " },
    { key: "dayOfMonth", values: "1-31", specials: "* , - / ? L W" },
    { key: "month", values: "1-12, JAN-DEC", specials: "* , - / " },
    { key: "dayOfWeek", values: "0-7, SUN-SAT", specials: "* , - / ? L #" },
    { key: "year", values: "1970-2199", specials: "* , - / " },
] as const;

const SYNTAX_ROWS = [
    { key: "star", token: "*" },
    { key: "list", token: "1,15,30" },
    { key: "range", token: "MON-FRI" },
    { key: "step", token: "*/15" },
    { key: "rangeStep", token: "0-30/10" },
    { key: "openStep", token: "5/15" },
    { key: "unspecified", token: "?" },
    { key: "lastDay", token: "L" },
    { key: "lastDayOffset", token: "L-3" },
    { key: "lastWeekday", token: "LW" },
    { key: "nearestWeekday", token: "15W" },
    { key: "lastNamedWeekday", token: "FRIL" },
    { key: "nthWeekday", token: "FRI#3" },
] as const;

const MACRO_ROWS = [
    { key: "yearly", token: "@yearly", equivalent: "0 0 1 1 *" },
    { key: "monthly", token: "@monthly", equivalent: "0 0 1 * *" },
    { key: "weekly", token: "@weekly", equivalent: "0 0 * * 0" },
    { key: "daily", token: "@daily", equivalent: "0 0 * * *" },
    { key: "hourly", token: "@hourly", equivalent: "0 * * * *" },
    { key: "reboot", token: "@reboot", equivalent: "—" },
] as const;

const OPTION_ROWS = ["timeZone", "weekdayBase", "runCount"] as const;

export async function CronArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("cron.article"),
        getTranslations("cron.toc"),
        getCronFaqEntries(),
    ]);

    const tocItems: TocItem[] = CRON_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="fields" title={t("fields.title")}>
                    <div className={PROSE}>
                        <p>{t("fields.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("fields.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("fields.colField")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("fields.colValues")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("fields.colSpecial")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("fields.colNotes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {FIELD_ROWS.map((row) => (
                                    <tr key={row.key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`fields.${row.key}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {row.values}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {row.specials.trim()}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`fields.${row.key}Notes`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("fields.counts")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="syntax" title={t("syntax.title")}>
                    <div className={PROSE}>
                        <p>{t("syntax.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("syntax.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("syntax.colToken")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("syntax.colMeans")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("syntax.colWhere")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SYNTAX_ROWS.map((row) => (
                                    <tr key={row.key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.token}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`syntax.${row.key}Means`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`syntax.${row.key}Where`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("syntax.noWrap")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="macros" title={t("macros.title")}>
                    <div className={PROSE}>
                        <p>{t("macros.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("macros.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("macros.colMacro")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("macros.colEquivalent")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("macros.colNotes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {MACRO_ROWS.map((row) => (
                                    <tr key={row.key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.token}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {row.equivalent}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`macros.${row.key}Notes`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                        <p>{t("options.baseNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="traps" title={t("traps.title")}>
                    <div className={PROSE}>
                        <p>{t("traps.dayUnion")}</p>
                        <p>{t("traps.stepFromZero")}</p>
                        <p>{t("traps.dst")}</p>
                        <p>{t("traps.zoneless")}</p>
                        <p>{t("traps.overlap")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.p1")}</p>
                        <p>{t("useCases.p2")}</p>
                        <p>{t("useCases.p3")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("useCases.offline")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
