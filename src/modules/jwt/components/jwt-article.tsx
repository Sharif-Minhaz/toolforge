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
import { REGISTERED_CLAIMS } from "../types";

export const JWT_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "anatomy", titleKey: "anatomy.title" },
    { id: "claims", titleKey: "claims.title" },
    { id: "algorithms", titleKey: "algorithms.title" },
    { id: "verifying", titleKey: "verifying.title" },
    { id: "options", titleKey: "options.title" },
    { id: "pitfalls", titleKey: "pitfalls.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** The controls the workbench exposes, in the order they are met. */
const OPTION_ROWS = [
    "mode",
    "example",
    "view",
    "expectedAlgorithm",
    "secret",
    "base64url",
    "pem",
    "download",
] as const;

const SEGMENT_ROWS = ["header", "payload", "signature"] as const;

const ALGORITHM_ROWS = [
    { family: "hmac", names: "HS256 · HS384 · HS512" },
    { family: "rsa", names: "RS256 · RS384 · RS512" },
    { family: "rsaPss", names: "PS256 · PS384 · PS512" },
    { family: "ecdsa", names: "ES256 · ES384 · ES512" },
    { family: "eddsa", names: "EdDSA" },
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getJwtFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("jwt.article");

    return (["1", "2", "3", "4", "5", "6"] as const).map((index) => ({
        question: t(`faq.q${index}`),
        answer: t.markup(`faq.a${index}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${index}`, ARTICLE_TAGS),
    }));
}

const TABLE_WRAP = "ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset";
const HEAD_CELL = "px-4 py-2.5 font-medium";
const ROW_HEAD = "text-primary px-4 py-3 text-[0.8125rem] font-medium";
const BODY_CELL = "text-muted-foreground px-4 py-3";

export async function JwtArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("jwt.article"),
        getTranslations("jwt.toc"),
        getJwtFaqEntries(),
    ]);

    const tocItems: TocItem[] = JWT_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="anatomy" title={t("anatomy.title")}>
                    <div className={PROSE}>
                        <p>{t("anatomy.intro")}</p>
                    </div>

                    <div className={TABLE_WRAP}>
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("anatomy.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("anatomy.colSegment")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("anatomy.colHolds")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("anatomy.colSigned")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SEGMENT_ROWS.map((segment) => (
                                    <tr key={segment} className="align-top">
                                        <th scope="row" className={`${ROW_HEAD} font-mono`}>
                                            {t(`anatomy.${segment}Name`)}
                                        </th>
                                        <td className={BODY_CELL}>
                                            {t.rich(`anatomy.${segment}Holds`, ARTICLE_TAGS)}
                                        </td>
                                        <td className={BODY_CELL}>
                                            {t(`anatomy.${segment}Signed`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>
                        {t.rich("anatomy.encoding", ARTICLE_TAGS)}
                    </p>
                </ArticleSection>

                <ArticleSection id="claims" title={t("claims.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("claims.intro", ARTICLE_TAGS)}</p>
                    </div>

                    <div className={TABLE_WRAP}>
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("claims.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("claims.colClaim")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("claims.colName")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("claims.colCarries")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {REGISTERED_CLAIMS.map((claim) => (
                                    <tr key={claim} className="align-top">
                                        <th scope="row" className={`${ROW_HEAD} font-mono`}>
                                            {claim}
                                        </th>
                                        <td className={BODY_CELL}>{t(`claims.${claim}Name`)}</td>
                                        <td className={BODY_CELL}>
                                            {t.rich(`claims.${claim}Detail`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("claims.privateClaims")}</p>
                </ArticleSection>

                <ArticleSection id="algorithms" title={t("algorithms.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("algorithms.intro", ARTICLE_TAGS)}</p>
                    </div>

                    <div className={TABLE_WRAP}>
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("algorithms.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("algorithms.colFamily")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("algorithms.colNames")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("algorithms.colKey")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("algorithms.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {ALGORITHM_ROWS.map((row) => (
                                    <tr key={row.family} className="align-top">
                                        <th scope="row" className={ROW_HEAD}>
                                            {t(`algorithms.${row.family}Name`)}
                                        </th>
                                        <td
                                            className={`${BODY_CELL} font-mono text-[0.8125rem] whitespace-nowrap`}
                                        >
                                            {row.names}
                                        </td>
                                        <td className={BODY_CELL}>
                                            {t(`algorithms.${row.family}Key`)}
                                        </td>
                                        <td className={BODY_CELL}>
                                            {t.rich(`algorithms.${row.family}When`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("algorithms.noneNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("algorithms.sizeNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="verifying" title={t("verifying.title")}>
                    <div className={PROSE}>
                        <p>{t("verifying.p1")}</p>
                        <p>{t.rich("verifying.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("verifying.p3", ARTICLE_TAGS)}</p>
                        <p>{t("verifying.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t("options.intro")}</p>
                    </div>

                    <div className={TABLE_WRAP}>
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("options.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("options.colOption")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("options.colDoes")}
                                    </th>
                                    <th scope="col" className={HEAD_CELL}>
                                        {t("options.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th scope="row" className={`${ROW_HEAD} whitespace-nowrap`}>
                                            {t(`options.${row}Name`)}
                                        </th>
                                        <td className={BODY_CELL}>
                                            {t.rich(`options.${row}Does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className={BODY_CELL}>
                                            {t.rich(`options.${row}When`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("options.headerOwnsAlg", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.noTokenParam", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="pitfalls" title={t("pitfalls.title")}>
                    <div className={PROSE}>
                        <p>{t("pitfalls.p1")}</p>
                        <p>{t.rich("pitfalls.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("pitfalls.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("pitfalls.p4", ARTICLE_TAGS)}</p>
                        <p>{t.rich("pitfalls.p5", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
