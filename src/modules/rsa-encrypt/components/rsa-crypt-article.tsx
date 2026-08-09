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

export const RSA_CRYPT_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "oaep", titleKey: "oaep.title" },
    { id: "keys", titleKey: "keys.title" },
    { id: "options", titleKey: "options.title" },
    { id: "interop", titleKey: "interop.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Every control the workbench shows, in the order it shows them. */
const OPTION_ROWS = [
    "direction",
    "keyFormat",
    "keyKind",
    "padding",
    "hash",
    "key",
    "payload",
    "output",
    "download",
    "reset",
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * Each answer is read twice from one marked-up message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which cannot hold an element and must not hold a
 * literal `<code>` either.
 */
export async function getRsaCryptFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("rsaEncrypt.article");

    return [
        {
            question: t("faq.q1"),
            answer: t.markup("faq.a1", PLAIN_TAGS),
            answerNode: t.rich("faq.a1", ARTICLE_TAGS),
        },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        {
            question: t("faq.q3"),
            answer: t.markup("faq.a3", PLAIN_TAGS),
            answerNode: t.rich("faq.a3", ARTICLE_TAGS),
        },
        { question: t("faq.q4"), answer: t("faq.a4") },
        {
            question: t("faq.q5"),
            answer: t.markup("faq.a5", PLAIN_TAGS),
            answerNode: t.rich("faq.a5", ARTICLE_TAGS),
        },
        {
            question: t("faq.q6"),
            answer: t.markup("faq.a6", PLAIN_TAGS),
            answerNode: t.rich("faq.a6", ARTICLE_TAGS),
        },
        {
            question: t("faq.q7"),
            answer: t.markup("faq.a7", PLAIN_TAGS),
            answerNode: t.rich("faq.a7", ARTICLE_TAGS),
        },
        {
            question: t("faq.q8"),
            answer: t.markup("faq.a8", PLAIN_TAGS),
            answerNode: t.rich("faq.a8", ARTICLE_TAGS),
        },
    ];
}

export async function RsaCryptArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("rsaEncrypt.article"),
        getTranslations("rsaEncrypt.toc"),
        getRsaCryptFaqEntries(),
    ]);

    const tocItems: TocItem[] = RSA_CRYPT_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="oaep" title={t("oaep.title")}>
                    <div className={PROSE}>
                        <p>{t("oaep.p1")}</p>
                        <p>{t.rich("oaep.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("oaep.p3", ARTICLE_TAGS)}</p>
                        <p>{t.rich("oaep.p4", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="keys" title={t("keys.title")}>
                    <div className={PROSE}>
                        <p>{t("keys.p1")}</p>
                        <p>{t("keys.p2")}</p>
                        <p>{t("keys.p3")}</p>
                        <p>{t.rich("keys.p4", ARTICLE_TAGS)}</p>
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
                                            {t.rich(`options.${row}Does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`options.${row}When`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("options.sizeNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.hashSizeNote", ARTICLE_TAGS)}</p>
                        <p>{t("options.keyKindNote")}</p>
                        <p>{t.rich("options.pkcs1Note", ARTICLE_TAGS)}</p>
                        <p>{t.rich("options.randomNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="interop" title={t("interop.title")}>
                    <p className={PROSE_TEXT}>{t("interop.intro")}</p>

                    <ol className={`mt-4 list-decimal space-y-4 pl-5 ${PROSE_TEXT}`}>
                        <li>{t.rich("interop.p1", ARTICLE_TAGS)}</li>
                        <li>{t.rich("interop.p2", ARTICLE_TAGS)}</li>
                        <li>{t.rich("interop.p3", ARTICLE_TAGS)}</li>
                    </ol>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("interop.hashNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("useCases.p1", ARTICLE_TAGS)}</p>
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
