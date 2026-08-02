import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { ALGORITHM_LABELS } from "../domain/algorithms";

export const HASH_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "choosing", titleKey: "choosing.title" },
    { id: "passwords", titleKey: "passwords.title" },
    { id: "options", titleKey: "options.title" },
    { id: "comparing", titleKey: "comparing.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * Rows of the algorithm table. Keyed off a literal tuple so the message lookups
 * stay statically checked; `family` picks which of the two group labels applies.
 */
const CHOOSING_ROWS = [
    { key: "md5", label: ALGORITHM_LABELS.md5, family: "familyDigest" },
    { key: "sha1", label: ALGORITHM_LABELS.sha1, family: "familyDigest" },
    { key: "sha256", label: ALGORITHM_LABELS.sha256, family: "familyDigest" },
    { key: "sha512", label: ALGORITHM_LABELS.sha512, family: "familyDigest" },
    { key: "bcrypt", label: ALGORITHM_LABELS.bcrypt, family: "familyPassword" },
    { key: "argon2", label: ALGORITHM_LABELS.argon2id, family: "familyPassword" },
] as const;

const OPTION_ROWS = [
    "mode",
    "algorithm",
    "encoding",
    "uppercase",
    "cost",
    "memory",
    "iterations",
    "parallelism",
    "hashLength",
    "newSalt",
    "download",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getHashFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("hash.article");

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

export async function HashArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("hash.article"),
        getTranslations("hash.toc"),
        getHashFaqEntries(),
    ]);

    const tocItems: TocItem[] = HASH_ARTICLE_SECTIONS.map((section) => ({
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
                    </div>
                </ArticleSection>

                <ArticleSection id="choosing" title={t("choosing.title")}>
                    <div className={PROSE}>
                        <p>{t("choosing.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("choosing.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("choosing.colAlgorithm")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("choosing.colFamily")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("choosing.colUseFor")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("choosing.colAvoid")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CHOOSING_ROWS.map((row) => (
                                    <tr key={row.key} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {row.label}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                                            {t(`choosing.${row.family}`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`choosing.${row.key}UseFor`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`choosing.${row.key}Avoid`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("choosing.variantsNote")}</p>
                        <p>{t("choosing.shaNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="passwords" title={t("passwords.title")}>
                    <div className={PROSE}>
                        <p>{t("passwords.p1")}</p>
                        <p>{t("passwords.p2")}</p>
                        <p>{t("passwords.p3")}</p>
                        <p>{t("passwords.p4")}</p>
                        <p>{t("passwords.p5")}</p>
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
                        <p>{t("options.saltNote")}</p>
                        <p>{t("options.costNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="comparing" title={t("comparing.title")}>
                    <p className={PROSE_TEXT}>{t("comparing.intro")}</p>

                    <ol className={`mt-4 list-decimal space-y-4 pl-5 ${PROSE_TEXT}`}>
                        <li>{t("comparing.p1")}</li>
                        <li>{t("comparing.p2")}</li>
                        <li>{t("comparing.p3")}</li>
                        <li>{t("comparing.p4")}</li>
                    </ol>
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
