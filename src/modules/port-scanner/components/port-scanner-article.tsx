import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import {
    MAX_PORTS_PER_SCAN,
    PORT_TIMEOUT_MS,
    QUOTA_LIMIT,
    SCAN_CONCURRENCY,
} from "../domain/constants";
import { presetPorts } from "../domain/ports";
import { PORT_PRESETS, PORT_STATES, type PortPreset } from "../types";

export const PORT_SCANNER_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "states", titleKey: "states.title" },
    { id: "presets", titleKey: "presets.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "legal", titleKey: "legal.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * The limits table reads its numbers from the constants the scanner runs on, so
 * the article cannot claim a ceiling the code does not enforce. Only the range
 * row has no number — it is a list of families, not a figure.
 */
const LIMIT_ROWS = [
    { id: "ports", labelKey: "portsLimit", whyKey: "portsWhy", value: String(MAX_PORTS_PER_SCAN) },
    {
        id: "timeout",
        labelKey: "timeoutLimit",
        whyKey: "timeoutWhy",
        value: `${PORT_TIMEOUT_MS} ms`,
    },
    {
        id: "concurrency",
        labelKey: "concurrencyLimit",
        whyKey: "concurrencyWhy",
        value: String(SCAN_CONCURRENCY),
    },
    { id: "quota", labelKey: "quotaLimit", whyKey: "quotaWhy", value: `${QUOTA_LIMIT} / hour` },
    { id: "ranges", labelKey: "rangesLimit", whyKey: "rangesWhy", value: "—" },
] as const;

/** Port numbers are data, so the preset table prints the real lists. */
function describePreset(preset: PortPreset): string {
    const ports = presetPorts(preset);

    return ports.length === 0 ? "—" : ports.join(", ");
}

export async function getPortScannerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("portScanner.article");

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

export async function PortScannerArticle() {
    const [t, tStates, tStateHints, tPresets, tPresetHints, tToc, faqs] = await Promise.all([
        getTranslations("portScanner.article"),
        getTranslations("portScanner.states"),
        getTranslations("portScanner.stateHints"),
        getTranslations("portScanner.presets"),
        getTranslations("portScanner.presetHints"),
        getTranslations("portScanner.toc"),
        getPortScannerFaqEntries(),
    ]);

    const tocItems: TocItem[] = PORT_SCANNER_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t("understanding.p2")}</p>
                        <p>{t("understanding.p3")}</p>
                        <p>{t("understanding.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="states" title={t("states.title")}>
                    <div className={PROSE}>
                        <p>{t("states.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("states.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("states.colState")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("states.colMeans")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("states.colProves")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {/* A literal union, so every key below is
                                    checked at compile time. */}
                                {PORT_STATES.map((state) => (
                                    <tr key={state} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tStates(state)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {tStateHints(state)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(
                                                `states.proves${state.charAt(0).toUpperCase()}${state.slice(1)}` as
                                                    | "states.provesOpen"
                                                    | "states.provesClosed"
                                                    | "states.provesFiltered",
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="presets" title={t("presets.title")}>
                    <div className={PROSE}>
                        <p>{t("presets.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("presets.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("presets.colPreset")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("presets.colCovers")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {PORT_PRESETS.map((preset) => (
                                    <tr key={preset} className="align-top">
                                        <th
                                            scope="row"
                                            className="px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            <span className="text-primary">{tPresets(preset)}</span>
                                            <span className="text-muted-foreground mt-1 block text-[0.75rem] font-normal">
                                                {tPresetHints(preset)}
                                            </span>
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            <code className="text-syntax-number text-[0.75rem] break-words">
                                                {describePreset(preset)}
                                            </code>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("presets.outro")}</p>
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
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-number text-[0.75rem] whitespace-nowrap">
                                                {row.value}
                                            </code>
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

                <ArticleSection id="legal" title={t("legal.title")}>
                    <div className={PROSE}>
                        <p>{t("legal.p1")}</p>
                        <p>{t("legal.p2")}</p>
                        <p>{t("legal.p3")}</p>
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
