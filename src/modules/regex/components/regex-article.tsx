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
import { REPLACEMENT_TOKENS } from "../domain/constants";
import { FLAG_LETTERS } from "../domain/flags";
import { DELIMITER_CHARACTERS, REGEX_DELIMITERS, REGEX_FLAGS } from "../types";

export const REGEX_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "syntax", titleKey: "syntax.title" },
    { id: "flags", titleKey: "flags.title" },
    { id: "modes", titleKey: "modes.title" },
    { id: "delimiters", titleKey: "delimiters.title" },
    { id: "engine", titleKey: "engine.title" },
    { id: "performance", titleKey: "performance.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getRegexFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("regex.article");

    return (["1", "2", "3", "4", "5", "6"] as const).map((index) => ({
        question: t(`faq.q${index}`),
        answer: t.markup(`faq.a${index}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${index}`, ARTICLE_TAGS),
    }));
}

/**
 * Syntax rows are technical data — the token itself is the same in every
 * locale — so the tokens live here and only the prose comes from the catalogue.
 */
const SYNTAX_ROWS = [
    { key: "anchors", tokens: "^ $ \\b \\B" },
    { key: "classes", tokens: "[abc] [^abc] [a-z] ." },
    { key: "shorthands", tokens: "\\d \\w \\s \\D \\W \\S" },
    { key: "quantifiers", tokens: "* + ? {2} {2,} {2,6}" },
    { key: "lazy", tokens: "*? +? ?? {2,6}?" },
    { key: "groups", tokens: "(…) (?:…) (?<name>…)" },
    { key: "alternation", tokens: "a|b" },
    { key: "lookaround", tokens: "(?=…) (?!…) (?<=…) (?<!…)" },
    { key: "backreferences", tokens: "\\1 \\k<name>" },
    { key: "escapes", tokens: "\\. \\n \\t \\x41 \\u{1F600} \\p{L}" },
] as const;

export async function RegexArticle() {
    const [t, tToc, tWorkbench, faqs] = await Promise.all([
        getTranslations("regex.article"),
        getTranslations("regex.toc"),
        getTranslations("regex.workbench"),
        getRegexFaqEntries(),
    ]);

    const tocItems: TocItem[] = REGEX_ARTICLE_SECTIONS.map((section) => ({
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
                        <ArticleExample>
                            {t.rich("understanding.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t("understanding.p2")}</p>
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
                                        {t("syntax.colExample")}
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
                                            {row.tokens}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`syntax.${row.key}Means`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`syntax.${row.key}Example`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t.rich("syntax.note", ARTICLE_TAGS)}</p>
                </ArticleSection>

                <ArticleSection id="flags" title={t("flags.title")}>
                    <div className={PROSE}>
                        <p>{t("flags.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("flags.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("flags.colFlag")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("flags.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("flags.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {REGEX_FLAGS.map((flag) => (
                                    <tr key={flag} className="align-top">
                                        <th
                                            scope="row"
                                            className="px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            <span className="text-primary font-mono">
                                                {FLAG_LETTERS[flag]}
                                            </span>{" "}
                                            <span className="text-muted-foreground font-normal">
                                                {tWorkbench(`flags.${flag}.name`)}
                                            </span>
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`flags.${flag}Does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`flags.${flag}When`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("flags.rewriteNote")}</p>
                        <p>{t("flags.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="modes" title={t("modes.title")}>
                    <div className={PROSE}>
                        <p>{t("modes.intro")}</p>
                        <p>{t.rich("modes.match", ARTICLE_TAGS)}</p>
                        <p>{t.rich("modes.substitute", ARTICLE_TAGS)}</p>
                        <p>{t("modes.list")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-120 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("modes.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colToken")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colInserts")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {REPLACEMENT_TOKENS.map(({ key, token }) => (
                                    <tr key={key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {token}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`modes.token_${key}`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t.rich("modes.zeroNote", ARTICLE_TAGS)}</p>
                </ArticleSection>

                <ArticleSection id="delimiters" title={t("delimiters.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("delimiters.p1", ARTICLE_TAGS)}</p>
                        <p>{t("delimiters.p2")}</p>
                    </div>

                    <ul className="mt-5 flex flex-wrap gap-1.5">
                        {REGEX_DELIMITERS.map((delimiter) => (
                            <li
                                key={delimiter}
                                className="bg-card/70 ring-border/70 text-muted-foreground inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.8125rem] ring-1 ring-inset"
                            >
                                <span className="text-primary font-mono">
                                    {DELIMITER_CHARACTERS[delimiter]}
                                </span>
                                <span className="leading-[1.3]">
                                    {tWorkbench(`delimiters.${delimiter}`)}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("delimiters.p3")}</p>
                        <p>{t("delimiters.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="engine" title={t("engine.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("engine.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("engine.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("engine.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="performance" title={t("performance.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("performance.p1", ARTICLE_TAGS)}</p>
                        <p>{t("performance.p2")}</p>
                        <p>{t("performance.p3")}</p>
                        <p>{t("performance.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
