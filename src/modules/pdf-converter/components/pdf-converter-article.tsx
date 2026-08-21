import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE } from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const PDF_CONVERTER_ARTICLE_SECTIONS = [
    { id: "formats", titleKey: "formats.title" },
    { id: "text", titleKey: "text.title" },
    { id: "options", titleKey: "options.title" },
    { id: "fidelity", titleKey: "fidelity.title" },
    { id: "fonts", titleKey: "fonts.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Every control the panel shows, in the order the panel shows them. */
const OPTION_ROWS = [
    "pageSize",
    "orientation",
    "margin",
    "fontSize",
    "pageNumbers",
    "includeImages",
    "showLinkUrls",
    "includeSpeakerNotes",
    "repeatHeaderRow",
    "separateSheets",
] as const;

const FIDELITY_ROWS = ["docx", "pptx", "xlsx", "html"] as const;

const FAQ_KEYS = ["text", "server", "doc", "fidelity", "scripts", "charts", "size"] as const;

/** Shared by the FAQ section and the page's structured data, so they cannot drift. */
export async function getPdfConverterFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("pdfConverter.article.faq");

    return FAQ_KEYS.map((key) => ({
        question: t(`${key}.question`),
        answer: t(`${key}.answer`),
    }));
}

export async function PdfConverterArticle() {
    const [t, tOptions, tToc, faqs] = await Promise.all([
        getTranslations("pdfConverter.article"),
        getTranslations("pdfConverter.workbench"),
        getTranslations("pdfConverter.toc"),
        getPdfConverterFaqEntries(),
    ]);

    const tocItems: TocItem[] = PDF_CONVERTER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="formats" title={t("formats.title")}>
                    <div className={PROSE}>
                        <p>{t("formats.p1")}</p>
                        <p>{t("formats.p2")}</p>
                        <p>{t("formats.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="text" title={t("text.title")}>
                    <div className={PROSE}>
                        <p>{t("text.p1")}</p>
                        <p>{t("text.p2")}</p>
                        <p>{t("text.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="options" title={t("options.title")}>
                    <div className={PROSE}>
                        <p>{t("options.p1")}</p>
                    </div>

                    {/* The table breaks out of the prose column and scrolls
                        inside its own box, so the page never scrolls sideways. */}
                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("options.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.columnOption")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.columnDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("options.columnWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {OPTION_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="text-primary px-4 py-3 text-[0.8125rem] font-medium"
                                        >
                                            {tOptions(`${row}Label`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.rows.${row}.does`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3">
                                            {t(`options.rows.${row}.when`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`mt-5 ${PROSE}`}>
                        <p>{t("options.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="fidelity" title={t("fidelity.title")}>
                    <div className={PROSE}>
                        <p>{t("fidelity.p1")}</p>
                    </div>

                    <dl className="mt-5 flex max-w-[68ch] flex-col gap-5">
                        {FIDELITY_ROWS.map((row) => (
                            <div key={row} className="flex flex-col gap-1.5">
                                <dt className="text-[0.9375rem] leading-[1.4] font-medium">
                                    {t(`fidelity.${row}.title`)}
                                </dt>
                                <dd className="text-muted-foreground text-[0.9375rem] leading-7">
                                    {t(`fidelity.${row}.body`)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </ArticleSection>

                <ArticleSection id="fonts" title={t("fonts.title")}>
                    <div className={PROSE}>
                        <p>{t("fonts.p1")}</p>
                        <p>{t("fonts.p2")}</p>
                        <p>{t("fonts.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                        <p>{t("privacy.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
