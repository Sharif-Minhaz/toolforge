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
import { superscript } from "@/modules/tools/domain/magnitude";
import { AMBIGUOUS_CHARACTERS, SIMILAR_CHARACTERS } from "../domain/alphabets";
import {
    ATTACK_GUESSES_PER_SECOND,
    PASSWORD_LENGTH_RANGE,
    STRENGTH_THRESHOLD_BITS,
} from "../domain/constants";
import { PASSPHRASE_WORDS } from "../domain/wordlist";
import { ATTACK_MODELS, PASSWORD_MODES, PASSWORD_STRENGTHS } from "../types";

export const PASSWORD_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "entropy", titleKey: "entropy.title" },
    { id: "attackers", titleKey: "attackers.title" },
    { id: "modes", titleKey: "modes.title" },
    { id: "options", titleKey: "options.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "practices", titleKey: "practices.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getPasswordFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("password.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

const OPTION_ROWS = [
    "mode",
    "length",
    "classes",
    "excludeSimilar",
    "excludeAmbiguous",
    "separator",
    "capitalize",
    "includeNumber",
    "attack",
] as const;

/** Powers of ten read better than 100000000000 in a table. */
function formatRate(guessesPerSecond: number): string {
    return `10${superscript(Math.round(Math.log10(guessesPerSecond)))}`;
}

export async function PasswordArticle() {
    const [t, tModes, tAttacks, tStrengths, tToc, faqs] = await Promise.all([
        getTranslations("password.article"),
        getTranslations("password.workbench.modes"),
        getTranslations("password.attacks"),
        getTranslations("password.strengths"),
        getTranslations("password.toc"),
        getPasswordFaqEntries(),
    ]);

    const tocItems: TocItem[] = PASSWORD_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="entropy" title={t("entropy.title")}>
                    <div className={PROSE}>
                        <p>{t("entropy.p1")}</p>
                        <p>{t.rich("entropy.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("entropy.p3", ARTICLE_TAGS)}</p>
                        <p>{t("entropy.p4")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-120 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("entropy.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("entropy.colBand")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("entropy.colBits")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("entropy.colMeans")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {PASSWORD_STRENGTHS.map((band) => (
                                    <tr key={band} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tStrengths(band)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {STRENGTH_THRESHOLD_BITS[band]}+
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`entropy.bands.${band}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("entropy.guaranteeNote")}</p>
                </ArticleSection>

                <ArticleSection id="attackers" title={t("attackers.title")}>
                    <div className={PROSE}>
                        <p>{t("attackers.p1")}</p>
                        <p>{t("attackers.p2")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("attackers.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("attackers.colScenario")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("attackers.colRate")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("attackers.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {ATTACK_MODELS.map((model) => (
                                    <tr key={model} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            {tAttacks(`${model}.label`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {formatRate(ATTACK_GUESSES_PER_SECOND[model])}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`attackers.when.${model}`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("attackers.roundingNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("attackers.magnitudeNote", ARTICLE_TAGS)}</p>
                        <p>{t("attackers.averageNote")}</p>
                        <p>{t("attackers.knowledgeNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="modes" title={t("modes.title")}>
                    <div className={PROSE}>
                        <p>{t("modes.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("modes.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colMode")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colRange")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colBits")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {PASSWORD_MODES.map((mode) => (
                                    <tr key={mode} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {tModes(mode)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {PASSWORD_LENGTH_RANGE[mode].min}–
                                            {PASSWORD_LENGTH_RANGE[mode].max}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {t(`modes.bits.${mode}`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`modes.when.${mode}`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("modes.wordlistNote", { words: PASSPHRASE_WORDS.length })}</p>
                        <p>{t("modes.pinNote")}</p>
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
                        <p>{t("options.modeGatingNote")}</p>
                        <p>
                            {t.rich("options.similarSetNote", {
                                ...ARTICLE_TAGS,
                                characters: SIMILAR_CHARACTERS,
                            })}
                        </p>
                        <p>
                            {t.rich("options.ambiguousSetNote", {
                                ...ARTICLE_TAGS,
                                characters: AMBIGUOUS_CHARACTERS,
                            })}
                        </p>
                        <p>{t.rich("options.capitalizeNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.separatorNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.defaultsNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                        <p>{t.rich("privacy.p3", ARTICLE_TAGS)}</p>
                        <p>{t("privacy.p4")}</p>
                        <p>{t("privacy.p5")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="practices" title={t("practices.title")}>
                    <div className={PROSE}>
                        <p>{t("practices.p1")}</p>
                        <p>{t("practices.p2")}</p>
                        <p>{t("practices.p3")}</p>
                        <p>{t("practices.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
