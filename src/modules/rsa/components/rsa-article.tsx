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
import { KEY_FORMAT_LABELS, RSA_ALGORITHM_NAMES } from "../domain/constants";
import { pemLabelFor } from "@/modules/tools/domain/rsa-der";
import { RSA_KEY_FORMATS } from "@/modules/tools/types";

export const RSA_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "containers", titleKey: "containers.title" },
    { id: "options", titleKey: "options.title" },
    { id: "handling", titleKey: "handling.title" },
    { id: "interop", titleKey: "interop.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Every control the workbench shows, in the order it shows them. */
const OPTION_ROWS = [
    "keySize",
    "keyFormat",
    "outputFormat",
    "usage",
    "hash",
    "publicExponent",
    "generate",
    "download",
    "downloadBoth",
    "fingerprint",
    "reset",
] as const;

/**
 * Question/answer pairs, shared by the FAQ section and its structured data.
 *
 * A marked-up answer is read twice from one message: `t.rich` for the panel,
 * `t.markup` for the JSON-LD, which can hold neither an element nor a literal
 * `<code>`.
 */
export async function getRsaFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("rsa.article");

    return (["1", "2", "3", "4", "5", "6", "7", "8"] as const).map((index) => ({
        question: t(`faq.q${index}`),
        answer: t.markup(`faq.a${index}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${index}`, ARTICLE_TAGS),
    }));
}

export async function RsaArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("rsa.article"),
        getTranslations("rsa.toc"),
        getRsaFaqEntries(),
    ]);

    const tocItems: TocItem[] = RSA_ARTICLE_SECTIONS.map((section) => ({
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
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="containers" title={t("containers.title")}>
                    <div className={PROSE}>
                        <p>{t("containers.intro")}</p>
                        <p>{t("containers.structure")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("containers.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("containers.colFormat")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("containers.colPublic")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("containers.colPrivate")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("containers.colUseFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {RSA_KEY_FORMATS.map((format) => (
                                    <tr key={format} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {KEY_FORMAT_LABELS[format]}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {pemLabelFor(format, "public")}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap">
                                            {pemLabelFor(format, "private")}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t.rich(`containers.${format}UseFor`, ARTICLE_TAGS)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("containers.namingNote", ARTICLE_TAGS)}</p>
                        <p>{t("containers.derNote")}</p>
                        <p>{t.rich("containers.jwkNote", ARTICLE_TAGS)}</p>
                        <p>{t.rich("containers.opensslNote", ARTICLE_TAGS)}</p>
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
                        <p>{t("options.jwkExclusionNote")}</p>
                        <p>{t("options.staleNote")}</p>
                        <p>{t.rich("options.hashNote", ARTICLE_TAGS)}</p>
                        <p>
                            {t.rich("options.usageNote", {
                                ...ARTICLE_TAGS,
                                signing: RSA_ALGORITHM_NAMES.pkcs1v15,
                                pss: RSA_ALGORITHM_NAMES.pss,
                                oaep: RSA_ALGORITHM_NAMES.oaep,
                            })}
                        </p>
                        <p>{t("options.exponentNote")}</p>
                        <p>{t.rich("options.defaultsNote", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="handling" title={t("handling.title")}>
                    <div className={PROSE}>
                        <p>{t("handling.p1")}</p>
                        <p>{t.rich("handling.p2", ARTICLE_TAGS)}</p>
                        <p>{t("handling.p3")}</p>
                        <p>{t("handling.p4")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="interop" title={t("interop.title")}>
                    <p className={PROSE_TEXT}>{t("interop.intro")}</p>

                    <ol className={`mt-4 list-decimal space-y-4 pl-5 ${PROSE_TEXT}`}>
                        <li>{t.rich("interop.p1", ARTICLE_TAGS)}</li>
                        <li>{t.rich("interop.p2", ARTICLE_TAGS)}</li>
                        <li>{t.rich("interop.p3", ARTICLE_TAGS)}</li>
                        <li>{t.rich("interop.p4", ARTICLE_TAGS)}</li>
                    </ol>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t.rich("interop.fingerprintNote", ARTICLE_TAGS)}</p>
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
