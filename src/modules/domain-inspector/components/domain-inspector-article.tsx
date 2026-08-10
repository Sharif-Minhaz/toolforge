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
import { DNS_RECORD_TYPES } from "../types";

export const DOMAIN_INSPECTOR_ARTICLE_SECTIONS = [
    { id: "what", titleKey: "what.title" },
    { id: "panels", titleKey: "panels.title" },
    { id: "records", titleKey: "records.title" },
    { id: "propagation", titleKey: "propagation.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "licensing", titleKey: "licensing.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Mirrors the panels the workbench renders, so the table documents what ships. */
const PANEL_ROWS = [
    "overview",
    "dns",
    "registration",
    "hosting",
    "propagation",
    "certificate",
    "http",
    "technologies",
] as const;

const CONTROL_ROWS = ["host", "resolver", "probe", "copy", "download"] as const;

export async function getDomainInspectorFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("domainInspector.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
    ];
}

export async function DomainInspectorArticle() {
    const [t, tToc, tPanels, tTypes, faqs] = await Promise.all([
        getTranslations("domainInspector.article"),
        getTranslations("domainInspector.toc"),
        getTranslations("domainInspector.panels"),
        getTranslations("domainInspector.recordTypes"),
        getDomainInspectorFaqEntries(),
    ]);

    const tocItems: TocItem[] = DOMAIN_INSPECTOR_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="what" title={t("what.title")}>
                    <div className={PROSE}>
                        <p>{t("what.p1")}</p>
                        <ArticleExample>{t.rich("what.example", ARTICLE_TAGS)}</ArticleExample>
                        <p>{t("what.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="panels" title={t("panels.title")}>
                    <div className={PROSE}>
                        <p>{t("panels.intro")}</p>
                        <p>{t("panels.strip")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("panels.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("panels.colPanel")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("panels.colShows")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("panels.colSource")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {PANEL_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tPanels(row)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`panels.${row}Shows`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`panels.${row}Source`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("panels.independence")}</p>
                </ArticleSection>

                <ArticleSection id="records" title={t("records.title")}>
                    <div className={PROSE}>
                        <p>{t("records.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("records.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("records.colType")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("records.colMeans")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {DNS_RECORD_TYPES.map((type) => (
                                    <tr key={type} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {type}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {tTypes(type)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("records.srvNote")}</p>
                </ArticleSection>

                <ArticleSection id="propagation" title={t("propagation.title")}>
                    <div className={PROSE}>
                        <p>{t("propagation.p1")}</p>
                        <p>{t("propagation.p2")}</p>
                        <p>{t("propagation.p3")}</p>
                        <p>{t("propagation.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="controls" title={t("controls.title")}>
                    <div className={PROSE}>
                        <p>{t("controls.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("controls.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colOption")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CONTROL_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {t(`controls.${row}Name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`controls.${row}Does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`controls.${row}When`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("controls.probeCaveat")}</p>
                        <p>{t("controls.resolverCaveat")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="licensing" title={t("licensing.title")}>
                    <div className={PROSE}>
                        <p>{t("licensing.p1")}</p>
                        <p>{t("licensing.p2")}</p>
                        <p>{t("licensing.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                        <p>{t("privacy.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.p1")}</p>
                        <p>{t("limits.p2")}</p>
                        <p>{t("limits.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t("useCases.intro")}</p>
                    </div>

                    <ul className={`mt-4 flex flex-col gap-2.5 ${PROSE_TEXT}`}>
                        <li>{t("useCases.migration")}</li>
                        <li>{t("useCases.expiry")}</li>
                        <li>{t("useCases.mail")}</li>
                        <li>{t("useCases.diligence")}</li>
                        <li>{t("useCases.incident")}</li>
                    </ul>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
