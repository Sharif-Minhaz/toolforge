import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { percentEscape } from "../domain/codec";
import { keepsCharacterRaw } from "../domain/profiles";
import { URL_ENCODE_PROFILES } from "../types";

export const URL_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "why", titleKey: "why.title" },
    { id: "reference", titleKey: "reference.title" },
    { id: "profiles", titleKey: "profiles.title" },
    { id: "options", titleKey: "options.title" },
    { id: "doubleEncoding", titleKey: "doubleEncoding.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Printable ASCII punctuation, the part of the character table that actually
 * differs between profiles. Letters and digits are never encoded, and anything
 * outside ASCII depends on the character set.
 */
const REFERENCE_CHARACTERS = [
    " ",
    "!",
    '"',
    "#",
    "$",
    "%",
    "&",
    "'",
    "(",
    ")",
    "*",
    "+",
    ",",
    "-",
    ".",
    "/",
    ":",
    ";",
    "<",
    "=",
    ">",
    "?",
    "@",
    "[",
    "\\",
    "]",
    "^",
    "_",
    "`",
    "{",
    "|",
    "}",
    "~",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getUrlFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("url.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

export async function UrlArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("url.article"),
        getTranslations("url.toc"),
        getUrlFaqEntries(),
    ]);

    const tocItems: TocItem[] = URL_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Generated from the encoder itself, so the table cannot drift from what
    // the tool actually emits.
    const referenceRows = REFERENCE_CHARACTERS.map((character) => ({
        character,
        encoded: percentEscape(character.charCodeAt(0)),
        keptBy: URL_ENCODE_PROFILES.filter((profile) => keepsCharacterRaw(profile, character)),
    }));

    const profileRows = URL_ENCODE_PROFILES.map((profile) => ({
        profile,
        name: t(`profiles.${profile}Name`),
        keeps: t(`profiles.${profile}Keeps`),
        bestFor: t(`profiles.${profile}BestFor`),
    }));

    const optionRows = [
        "charset",
        "newline",
        "profile",
        "uppercaseHex",
        "perLine",
        "wrap",
        "plusAsSpace",
        "recursive",
    ] as const;

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
                    </div>
                </ArticleSection>

                <ArticleSection id="why" title={t("why.title")}>
                    <div className={PROSE}>
                        <p>{t("why.p1")}</p>
                        <p>{t("why.p2")}</p>
                        <p>{t("why.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="reference" title={t("reference.title")}>
                    <div className={PROSE}>
                        <p>{t("reference.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-140 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("reference.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reference.colCharacter")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reference.colEncoded")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("reference.colKept")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {referenceRows.map((row) => (
                                    <tr key={row.encoded} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-2.5 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.character === " " ? (
                                                <span className="text-muted-foreground font-sans italic">
                                                    {t("reference.spaceLabel")}
                                                </span>
                                            ) : (
                                                row.character
                                            )}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-2.5 font-mono text-[0.8125rem]">
                                            {row.encoded}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-2.5">
                                            {row.keptBy.length === 0
                                                ? t("reference.keptByNone")
                                                : row.keptBy
                                                      .map((profile) =>
                                                          t(`profiles.${profile}Name`),
                                                      )
                                                      .join(", ")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("reference.note")}</p>
                </ArticleSection>

                <ArticleSection id="profiles" title={t("profiles.title")}>
                    <div className={PROSE}>
                        <p>{t("profiles.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("profiles.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("profiles.colProfile")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("profiles.colKeeps")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("profiles.colBestFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {profileRows.map((row) => (
                                    <tr key={row.profile} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.name}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem]">
                                            {row.keeps}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {row.bestFor}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`mt-5 ${PROSE_TEXT}`}>{t("profiles.note")}</p>
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
                                {optionRows.map((row) => (
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
                        <p>{t("options.charsetNote")}</p>
                        <p>{t("options.linesNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="doubleEncoding" title={t("doubleEncoding.title")}>
                    <div className={PROSE}>
                        <p>{t("doubleEncoding.p1")}</p>
                        <p>{t("doubleEncoding.p2")}</p>
                        <p>{t("doubleEncoding.p3")}</p>
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
