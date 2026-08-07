import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MODE_LABELS } from "../domain/labels";
import { ivBytesFor } from "../domain/modes";
import { AES_MODES } from "../types";

export const AES_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "modes", titleKey: "modes.title" },
    { id: "keys", titleKey: "keys.title" },
    { id: "options", titleKey: "options.title" },
    { id: "interop", titleKey: "interop.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Every control the workbench shows, in the order it shows them. */
const OPTION_ROWS = [
    "direction",
    "mode",
    "keySize",
    "keySource",
    "key",
    "file",
    "textEncoding",
    "cipherEncoding",
    "salt",
    "iv",
    "tagLength",
    "iterations",
    "swap",
    "download",
    "downloadBytes",
] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getAesFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("aes.article");

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        { question: t("faq.q2"), answer: t("faq.a2") },
        { question: t("faq.q3"), answer: t("faq.a3") },
        { question: t("faq.q4"), answer: t("faq.a4") },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
        { question: t("faq.q7"), answer: t("faq.a7") },
        { question: t("faq.q8"), answer: t("faq.a8") },
    ];
}

export async function AesArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("aes.article"),
        getTranslations("aes.toc"),
        getAesFaqEntries(),
    ]);

    const tocItems: TocItem[] = AES_ARTICLE_SECTIONS.map((section) => ({
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

                <ArticleSection id="modes" title={t("modes.title")}>
                    <div className={PROSE}>
                        <p>{t("modes.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-200 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("modes.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colMode")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colIv")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colDetects")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("modes.colUseFor")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {AES_MODES.map((mode) => (
                                    <tr key={mode} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 font-mono text-[0.8125rem] font-medium whitespace-nowrap"
                                        >
                                            {MODE_LABELS[mode]}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                                            {t("modes.ivWidth", { bytes: ivBytesFor(mode) })}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`modes.${mode}Detects`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`modes.${mode}UseFor`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("modes.tamperNote")}</p>
                        <p>{t("modes.reuseNote")}</p>
                        <p>{t("modes.ecbNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="keys" title={t("keys.title")}>
                    <div className={PROSE}>
                        <p>{t("keys.p1")}</p>
                        <p>{t("keys.p2")}</p>
                        <p>{t("keys.p3")}</p>
                        <p>{t("keys.p4")}</p>
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
                        <p>{t("options.rawKeyNote")}</p>
                        <p>{t("options.fileNote")}</p>
                        <p>{t("options.ivWidthNote")}</p>
                        <p>{t("options.tagNote")}</p>
                        <p>{t("options.defaultsNote")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="interop" title={t("interop.title")}>
                    <p className={PROSE_TEXT}>{t("interop.intro")}</p>

                    <ol className={`mt-4 list-decimal space-y-4 pl-5 ${PROSE_TEXT}`}>
                        <li>{t("interop.p1")}</li>
                        <li>{t("interop.p2")}</li>
                        <li>{t("interop.p3")}</li>
                        <li>{t("interop.p4")}</li>
                    </ol>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("interop.envelopeNote")}</p>
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
