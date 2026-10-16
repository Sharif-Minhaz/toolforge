import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

export const TEXT_TO_SPEECH_ARTICLE_SECTIONS = [
    { id: "howItWorks", titleKey: "howItWorks.title" },
    { id: "voices", titleKey: "voices.title" },
    { id: "pauses", titleKey: "pauses.title" },
    { id: "controls", titleKey: "controls.title" },
    { id: "files", titleKey: "files.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "privacy", titleKey: "privacy.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/** Mirrors the controls in the workbench, so the table documents what ships. */
const CONTROL_ROWS = [
    "text",
    "pauses",
    "clear",
    "language",
    "voice",
    "rate",
    "volume",
    "pitch",
    "keep",
    "reset",
    "generate",
    "cancel",
    "download",
    "file",
] as const;

/** One row per format the file tab reads, in the order the hint lists them. */
const FILE_ROWS = ["txt", "pdf", "doc", "docx", "odt", "sheets"] as const;

const FAQ_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/** Question/answer pairs, shared by the FAQ section and its structured data. */
export async function getTextToSpeechFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("textToSpeech.article");

    return FAQ_KEYS.map((key) => ({
        question: t(`faq.q${key}`),
        answer: t.markup(`faq.a${key}`, PLAIN_TAGS),
        answerNode: t.rich(`faq.a${key}`, ARTICLE_TAGS),
    }));
}

export async function TextToSpeechArticle() {
    const [t, tToc, faqs] = await Promise.all([
        getTranslations("textToSpeech.article"),
        getTranslations("textToSpeech.toc"),
        getTextToSpeechFaqEntries(),
    ]);

    const tocItems: TocItem[] = TEXT_TO_SPEECH_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={tocItems} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="howItWorks" title={t("howItWorks.title")}>
                    <div className={PROSE}>
                        <p>{t("howItWorks.p1")}</p>
                        <ArticleExample>
                            {t.rich("howItWorks.example", ARTICLE_TAGS)}
                        </ArticleExample>
                        <p>{t("howItWorks.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="voices" title={t("voices.title")}>
                    <div className={PROSE}>
                        <p>{t("voices.p1")}</p>
                        <p>{t.rich("voices.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="pauses" title={t("pauses.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("pauses.p1", ARTICLE_TAGS)}</p>
                        <p>{t("pauses.p2")}</p>
                        <p>{t.rich("pauses.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="controls" title={t("controls.title")}>
                    <div className={PROSE}>
                        <p>{t("controls.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("controls.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colControl")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colDoes")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("controls.colWhen")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {CONTROL_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="px-4 py-3 font-medium whitespace-nowrap"
                                        >
                                            {t(`controls.rows.${row}.name`)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 leading-6">
                                            {t.rich(`controls.rows.${row}.does`, ARTICLE_TAGS)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 leading-6">
                                            {t(`controls.rows.${row}.when`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={`${PROSE} mt-5`}>
                        <p>{t("controls.caveat")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="files" title={t("files.title")}>
                    <div className={PROSE}>
                        <p>{t("files.intro")}</p>
                    </div>

                    <div className="ring-border/80 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                        <table className="w-full min-w-160 border-collapse text-left text-sm">
                            <caption className="sr-only">{t("files.tableCaption")}</caption>
                            <thead>
                                <tr className="bg-muted/60">
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("files.colFormat")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("files.colRead")}
                                    </th>
                                    <th scope="col" className="px-4 py-2.5 font-medium">
                                        {t("files.colWatch")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-border/70 divide-y">
                                {FILE_ROWS.map((row) => (
                                    <tr key={row} className="align-top">
                                        <th
                                            scope="row"
                                            className="px-4 py-3 font-medium whitespace-nowrap"
                                        >
                                            {t.rich(`files.rows.${row}.name`, ARTICLE_TAGS)}
                                        </th>
                                        <td className="text-muted-foreground px-4 py-3 leading-6">
                                            {t(`files.rows.${row}.read`)}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-3 leading-6">
                                            {t(`files.rows.${row}.watch`)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limits.title")}>
                    <div className={PROSE}>
                        <p>{t("limits.p1")}</p>
                        <p>{t("limits.p2")}</p>
                        <p>{t("limits.p3")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacy.title")}>
                    <div className={PROSE}>
                        <p>{t("privacy.p1")}</p>
                        <p>{t("privacy.p2")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
