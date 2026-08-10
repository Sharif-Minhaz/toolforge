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
import {
    MAX_DELAY_MS,
    MAX_ENDPOINTS_PER_SERVER,
    MAX_EXECUTION_MS,
    MAX_OPENAPI_DOCUMENT_BYTES,
    MAX_RESPONSE_BYTES,
    MAX_SERVERS_PER_WORKSPACE,
    MAX_WORKSPACES_PER_BROWSER,
} from "../domain/constants";
import { LOG_RETENTION_DAYS, MAX_LOGS_PER_WORKSPACE } from "../domain/log-record";

export const MOCK_SERVER_ARTICLE_SECTIONS = [
    { id: "flow", titleKey: "flow.title" },
    { id: "ownership", titleKey: "ownership.title" },
    { id: "routes", titleKey: "routes.title" },
    { id: "responses", titleKey: "responses.title" },
    { id: "logic", titleKey: "logic.title" },
    { id: "variables", titleKey: "variables.title" },
    { id: "portability", titleKey: "portability.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

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

/**
 * Path syntax, with a request each pattern actually matches.
 *
 * The patterns and the example requests are data rather than copy: a translated
 * `/users/:id` is a path that no longer works.
 */
const PATH_ROWS = [
    { id: "static", pattern: "/users", example: "GET /users", meaningKey: "staticMeaning" },
    { id: "param", pattern: "/users/:id", example: "GET /users/42", meaningKey: "paramMeaning" },
    {
        id: "wildcard",
        pattern: "/files/*",
        example: "GET /files/logos/dark.png",
        meaningKey: "wildcardMeaning",
    },
] as const;

/** Every value type the response builder offers, and what each one puts in the reply. */
const VALUE_KIND_ROWS = [
    { id: "static", labelKey: "static", givesKey: "givesStatic" },
    { id: "request", labelKey: "request", givesKey: "givesRequest" },
    { id: "var", labelKey: "var", givesKey: "givesVar" },
    { id: "env", labelKey: "env", givesKey: "givesEnv" },
    { id: "faker", labelKey: "faker", givesKey: "givesFaker" },
    { id: "uuid", labelKey: "uuid", givesKey: "givesUuid" },
    { id: "now", labelKey: "now", givesKey: "givesNow" },
    { id: "template", labelKey: "template", givesKey: "givesTemplate" },
    { id: "object", labelKey: "object", givesKey: "givesObject" },
    { id: "array", labelKey: "array", givesKey: "givesArray" },
    { id: "oneOf", labelKey: "oneOf", givesKey: "givesOneOf" },
] as const;

/**
 * The node palette.
 *
 * `ready` mirrors `implemented` in `domain/node-registry.ts`. A table that
 * quietly listed a node which answers 500 would be worse than no table, so the
 * one entry that cannot run yet is labelled with the same words the canvas uses.
 */
const NODE_ROWS = [
    { id: "auth", labelKey: "auth", doesKey: "doesAuth", ready: true },
    { id: "condition", labelKey: "condition", doesKey: "doesCondition", ready: true },
    { id: "switch", labelKey: "switch", doesKey: "doesSwitch", ready: true },
    { id: "delay", labelKey: "delay", doesKey: "doesDelay", ready: true },
    { id: "randomBranch", labelKey: "randomBranch", doesKey: "doesRandomBranch", ready: true },
    { id: "setVariable", labelKey: "setVariable", doesKey: "doesSetVariable", ready: true },
    { id: "log", labelKey: "log", doesKey: "doesLog", ready: true },
    { id: "httpRequest", labelKey: "httpRequest", doesKey: "doesHttpRequest", ready: true },
    { id: "transform", labelKey: "transform", doesKey: "doesTransform", ready: false },
    { id: "response", labelKey: "response", doesKey: "doesResponse", ready: true },
] as const;

/**
 * The limits table, read from the constants rather than retyped.
 *
 * Copy that names a number the code no longer uses is worse than copy that
 * names none, and these move. Each row carries a unit message with an ICU
 * `{value, number}` argument so Bangla renders Bengali numerals.
 */
const LIMIT_ROWS = [
    {
        id: "workspaces",
        labelKey: "labelWorkspaces",
        value: MAX_WORKSPACES_PER_BROWSER,
        unitKey: "unitPerBrowser",
        whyKey: "whyWorkspaces",
    },
    {
        id: "servers",
        labelKey: "labelServers",
        value: MAX_SERVERS_PER_WORKSPACE,
        unitKey: "unitPerWorkspace",
        whyKey: "whyServers",
    },
    {
        id: "routes",
        labelKey: "labelRoutes",
        value: MAX_ENDPOINTS_PER_SERVER,
        unitKey: "unitPerServer",
        whyKey: "whyRoutes",
    },
    {
        id: "delay",
        labelKey: "labelDelay",
        value: MAX_DELAY_MS,
        unitKey: "unitMilliseconds",
        whyKey: "whyDelay",
    },
    {
        id: "runtime",
        labelKey: "labelRuntime",
        value: MAX_EXECUTION_MS / 1_000,
        unitKey: "unitSeconds",
        whyKey: "whyRuntime",
    },
    {
        id: "response",
        labelKey: "labelResponse",
        value: MAX_RESPONSE_BYTES / (1_024 * 1_024),
        unitKey: "unitMegabytes",
        whyKey: "whyResponse",
    },
    {
        id: "openapi",
        labelKey: "labelOpenapi",
        value: MAX_OPENAPI_DOCUMENT_BYTES / (1_024 * 1_024),
        unitKey: "unitMegabytes",
        whyKey: "whyOpenapi",
    },
    {
        id: "logs",
        labelKey: "labelLogs",
        value: MAX_LOGS_PER_WORKSPACE,
        unitKey: "unitPerWorkspace",
        whyKey: "whyLogs",
    },
    {
        id: "retention",
        labelKey: "labelRetention",
        value: LOG_RETENTION_DAYS,
        unitKey: "unitDays",
        whyKey: "whyRetention",
    },
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
    const [t, tToc, tValueKinds, tNodes, faqs] = await Promise.all([
        getTranslations("mockServer.article"),
        getTranslations("mockServer.toc"),
        getTranslations("mockServer.valueKinds"),
        getTranslations("mockServer.nodes"),
        getMockServerFaqEntries(),
    ]);

    const tocItems: TocItem[] = MOCK_SERVER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
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

                <ArticleSection id="ownership" title={t("ownership.title")}>
                    <div className={PROSE}>
                        <p>{t("ownership.p1")}</p>
                        <p>{t("ownership.p2")}</p>
                        <p>{t("ownership.p3")}</p>
                        <p>{t("ownership.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="routes" title={t("routes.title")}>
                    <div className={PROSE}>
                        <p>{t("routes.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("routes.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("routes.colPattern")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("routes.colExample")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("routes.colMeaning")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {PATH_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th scope="row" className="px-4 py-3 font-medium">
                                            <code className="text-syntax-key text-[0.75rem] break-all">
                                                {row.pattern}
                                            </code>
                                        </th>
                                        <td className="px-4 py-3">
                                            <code className="text-syntax-string text-[0.75rem] break-all">
                                                {row.example}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`routes.${row.meaningKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("routes.p1")}</p>
                        <p>{t("routes.p2")}</p>
                        <p>{t("routes.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="responses" title={t("responses.title")}>
                    <div className={PROSE}>
                        <p>{t("responses.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("responses.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("responses.colKind")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("responses.colGives")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {VALUE_KIND_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tValueKinds(row.labelKey)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`responses.${row.givesKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("responses.p1")}</p>
                        <p>{t("responses.p2")}</p>
                        <p>{t("responses.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="logic" title={t("logic.title")}>
                    <div className={PROSE}>
                        <p>{t("logic.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("logic.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("logic.colNode")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("logic.colDoes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {NODE_ROWS.map((row) => (
                                    <tr key={row.id} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            <span className="flex flex-col gap-1">
                                                {tNodes(row.labelKey)}
                                                {!row.ready && (
                                                    <span className="text-muted-foreground ring-border/70 w-fit rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-[1.3] font-normal ring-1 ring-inset">
                                                        {tNodes("comingSoon")}
                                                    </span>
                                                )}
                                            </span>
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`logic.${row.doesKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("logic.p1")}</p>
                        <p>{t("logic.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="variables" title={t("variables.title")}>
                    <div className={PROSE}>
                        <p>{t("variables.p1")}</p>
                        <p>{t("variables.p2")}</p>
                        <p>{t("variables.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="portability" title={t("portability.title")}>
                    <div className={PROSE}>
                        <p>{t("portability.p1")}</p>
                        <p>{t("portability.p2")}</p>
                        <p>{t("portability.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-180 border-collapse text-left text-sm">
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
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            {t(`limits.${row.labelKey}`)}
                                        </th>
                                        <td className="text-foreground px-4 py-3 whitespace-nowrap">
                                            {t(`limits.${row.unitKey}`, { value: row.value })}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`limits.${row.whyKey}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("limits.outro")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
