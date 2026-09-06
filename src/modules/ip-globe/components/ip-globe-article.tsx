import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

import {
    MAX_HOPS,
    MAX_HOSTS,
    MAX_INPUT_LENGTH,
    QUOTA_LIMIT_PER_ADDRESS,
    QUOTA_LIMIT_PER_DEPLOYMENT,
} from "../domain/constants";
import { HOP_STATUSES } from "../types";

export const IP_GLOBE_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "resolution", titleKey: "resolution.title" },
    { id: "input", titleKey: "input.title" },
    { id: "statuses", titleKey: "statuses.title" },
    { id: "options", titleKey: "options.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Every control on the tool. Adding one here is part of adding it to the page —
 * a switch the article does not mention is a switch nobody knows is there.
 */
const OPTION_ROWS = [
    { id: "mode", nameKey: "modeName", doesKey: "modeDoes", whenKey: "modeWhen" },
    { id: "resolver", nameKey: "resolverName", doesKey: "resolverDoes", whenKey: "resolverWhen" },
    { id: "rotate", nameKey: "rotateName", doesKey: "rotateDoes", whenKey: "rotateWhen" },
    { id: "arcs", nameKey: "arcsName", doesKey: "arcsDoes", whenKey: "arcsWhen" },
    { id: "group", nameKey: "groupName", doesKey: "groupDoes", whenKey: "groupWhen" },
] as const;

/**
 * The limits table reads its numbers from the constants the tool runs on, so
 * the article cannot claim a ceiling the code does not enforce.
 */
const LIMIT_ROWS = [
    {
        id: "perVisitor",
        labelKey: "perVisitor",
        whyKey: "perVisitorWhy",
        value: `${QUOTA_LIMIT_PER_ADDRESS} / hour`,
    },
    {
        id: "perSite",
        labelKey: "perSite",
        whyKey: "perSiteWhy",
        value: `${QUOTA_LIMIT_PER_DEPLOYMENT} / hour`,
    },
    { id: "hops", labelKey: "hops", whyKey: "hopsWhy", value: String(MAX_HOPS) },
    { id: "hosts", labelKey: "hosts", whyKey: "hostsWhy", value: String(MAX_HOSTS) },
    {
        id: "input",
        labelKey: "input",
        whyKey: "inputWhy",
        value: MAX_INPUT_LENGTH.toLocaleString("en-US"),
    },
] as const;

export async function getIpGlobeFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("ipGlobe.article");

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

export async function IpGlobeArticle() {
    const [t, tStatus, tToc, faqs] = await Promise.all([
        getTranslations("ipGlobe.article"),
        getTranslations("ipGlobe.hopStatus"),
        getTranslations("ipGlobe.toc"),
        getIpGlobeFaqEntries(),
    ]);

    const tocItems: TocItem[] = IP_GLOBE_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t("understanding.p1")}</p>
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                        <ArticleExample>{t("understanding.example")}</ArticleExample>
                        <p>{t("understanding.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="resolution" title={t("resolution.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("resolution.p1", ARTICLE_TAGS)}</p>
                        <p>{t("resolution.p2")}</p>
                        <p>{t("resolution.p3")}</p>
                        <p>{t("resolution.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="input" title={t("input.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("input.p1", ARTICLE_TAGS)}</p>
                        <p>{t("input.p2")}</p>
                        <p>{t.rich("input.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="statuses" title={t("statuses.title")}>
                    <div className={PROSE}>
                        <p>{t("statuses.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("statuses.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("statuses.colStatus")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("statuses.colMeans")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {HOP_STATUSES.map((status) => (
                                    <tr key={status} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tStatus(status)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`statuses.${status}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className="ring-border/80 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
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
                                            {t(`options.${row.nameKey}`)}
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

                    <div className={`${PROSE} mt-5`}>
                        <p>{t("options.caveat1")}</p>
                        <p>{t("options.caveat2")}</p>
                        <p>{t("options.caveat3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("limits.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("limits.colLimit")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("limits.colValue")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("limits.colWhy")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {LIMIT_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`limits.${row.labelKey}`)}
                                        </th>
                                        <td className="px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {row.value}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`limits.${row.whyKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
