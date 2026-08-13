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
import {
    DEFAULT_SECRET_BYTES,
    GRADE_THRESHOLD_BITS,
    MAX_SECRET_BYTES,
    MIN_SECRET_BYTES,
    SECRET_ALPHABET_SUMMARY,
    SECRET_BYTE_PRESETS,
    SECRET_ENCODING_LABELS,
    SECRET_KEY_USE_LABELS,
} from "../domain/constants";
import { countCharacters } from "../domain/encodings";
import { entropyBits, gradeSecret, keyUses } from "../domain/generate";
import {
    BASE64URL_SWAP_STAGE,
    equivalentCommand,
    PADDING_STRIP_STAGE,
    randStage,
} from "../domain/openssl";
import { SECRET_ENCODINGS, SECRET_GRADES } from "../types";

export const SECRET_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "command", titleKey: "command.title" },
    { id: "encodings", titleKey: "encodings.title" },
    { id: "sizing", titleKey: "sizing.title" },
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
export async function getSecretFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("secret.article");

    return [
        {
            question: t("faq.q1"),
            // The swap stage arrives as an argument for the same reason it does
            // in the article body: an apostrophe inside a message escapes what
            // follows it, and this answer has markup after the command.
            answer: t.markup("faq.a1", { ...PLAIN_TAGS, swap: BASE64URL_SWAP_STAGE }),
            answerNode: t.rich("faq.a1", { ...ARTICLE_TAGS, swap: BASE64URL_SWAP_STAGE }),
        },
        { question: t("faq.q2"), answer: t("faq.a2") },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
    ];
}

const OPTION_ROWS = ["bytes", "encoding", "padding", "shape", "name"] as const;

/**
 * The default byte count is what every width in the encodings table is quoted
 * at, so the reader can compare the columns against the value on screen rather
 * than against an abstraction.
 */
const SAMPLE_BYTES = DEFAULT_SECRET_BYTES;

/**
 * The stage table's left column, taken from the module that builds the command
 * rather than written out again in the catalogue.
 *
 * Two reasons, and either alone would be enough. A quoted fragment in a message
 * is a second copy of something the domain already owns, and it would drift.
 * And ICU reads an apostrophe as an escape, so `tr '+/' '-_'` in a message
 * swallows whatever follows it — which is how a `</code>` disappears and a
 * whole article section renders as its own key path.
 */
const COMMAND_STAGES = {
    rand: randStage(SAMPLE_BYTES, "base64url"),
    alphabet: BASE64URL_SWAP_STAGE,
    padding: PADDING_STRIP_STAGE,
} as const;

export async function SecretArticle() {
    const [t, tGrades, tToc, faqs] = await Promise.all([
        getTranslations("secret.article"),
        getTranslations("secret.grades"),
        getTranslations("secret.toc"),
        getSecretFaqEntries(),
    ]);

    const tocItems: TocItem[] = SECRET_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            {t.rich("understanding.example", {
                                ...ARTICLE_TAGS,
                                // Passed as an argument rather than written into
                                // the message: an argument's value is never
                                // re-parsed, so the apostrophes in the command
                                // cannot escape the markup around it.
                                command: equivalentCommand(SAMPLE_BYTES, "base64url", false),
                                characters: countCharacters(SAMPLE_BYTES, "base64url", false),
                                bits: entropyBits(SAMPLE_BYTES),
                            })}
                        </ArticleExample>
                        <p>{t.rich("understanding.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("understanding.p4", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="command" title={t("command.title")}>
                    <div className={PROSE}>
                        <p>{t("command.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("command.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("command.colStage")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("command.colDoes")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {(["rand", "alphabet", "padding"] as const).map((stage) => (
                                    <tr key={stage} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {COMMAND_STAGES[stage]}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`command.stages.${stage}Does`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("command.wrapNote", ARTICLE_TAGS)}</p>
                        <ArticleExample>{equivalentCommand(64, "base64url", false)}</ArticleExample>
                        <p>{t.rich("command.base32Note", ARTICLE_TAGS)}</p>
                        <p>{t.rich("command.parityNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="encodings" title={t("encodings.title")}>
                    <div className={PROSE}>
                        <p>{t("encodings.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">
                                {t("encodings.tableCaption", { bytes: SAMPLE_BYTES })}
                            </caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("encodings.colEncoding")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("encodings.colAlphabet")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("encodings.colWidth", { bytes: SAMPLE_BYTES })}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("encodings.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SECRET_ENCODINGS.map((encoding) => (
                                    <tr key={encoding} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {SECRET_ENCODING_LABELS[encoding]}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem]">
                                            {SECRET_ALPHABET_SUMMARY[encoding]}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {countCharacters(SAMPLE_BYTES, encoding, false)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`encodings.when.${encoding}`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("encodings.entropyNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("encodings.paddingNote", ARTICLE_TAGS)}</p>
                        <p>{t("encodings.respellNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="sizing" title={t("sizing.title")}>
                    <div className={PROSE}>
                        <p>{t("sizing.p1")}</p>
                        <p>{t.rich("sizing.p2", ARTICLE_TAGS)}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("sizing.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("sizing.colBytes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("sizing.colBits")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("sizing.colGrade")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("sizing.colUses")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {SECRET_BYTE_PRESETS.map((bytes) => (
                                    <tr key={bytes} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {bytes}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {entropyBits(bytes)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                                            {tGrades(gradeSecret(entropyBits(bytes)))}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem]">
                                            {keyUses(bytes)
                                                .map((use) => SECRET_KEY_USE_LABELS[use])
                                                .join(", ")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>
                            {t.rich("sizing.gradeNote", {
                                ...ARTICLE_TAGS,
                                strong: GRADE_THRESHOLD_BITS.strong,
                                veryStrong: GRADE_THRESHOLD_BITS["very-strong"],
                                grades: SECRET_GRADES.length,
                            })}
                        </p>
                        <p>{t.rich("sizing.exactNote", ARTICLE_TAGS)}</p>
                        <p>
                            {t("sizing.rangeNote", {
                                min: MIN_SECRET_BYTES,
                                max: MAX_SECRET_BYTES,
                            })}
                        </p>
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
                        <p>{t.rich("options.paddingGatingNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.nameGatingNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.badNameNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.quotingNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.defaultsNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                        <p>{t.rich("privacy.p3", ARTICLE_TAGS)}</p>
                        <p>{t("privacy.p4")}</p>
                        <p>{t.rich("privacy.p5", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="practices" title={t("practices.title")}>
                    <div className={PROSE}>
                        <p>{t("practices.p1")}</p>
                        <p>{t("practices.p2")}</p>
                        <p>{t("practices.p3")}</p>
                        <p>{t("practices.p4")}</p>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("practices.closing")}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
