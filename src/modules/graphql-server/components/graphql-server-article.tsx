import { getFormatter, getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import {
    DOCUMENT_WARN_RATIO,
    MAX_DOCUMENT_BYTES,
    MAX_UPLOAD_BYTES,
} from "@/modules/tools/domain/document-limits";

import { DEFAULT_PER_PAGE, MAX_LOG_ROWS, MAX_PER_PAGE } from "../domain/constants";

/**
 * The long-form half of the studio, written after the tool.
 *
 * A server component throughout — none of it reacts, and keeping it off the
 * island is what stops several kilobytes of prose from being shipped as
 * JavaScript to somebody who only wanted to run a query.
 *
 * The section ids are stable because they are anchors: a link somebody saved to
 * `#limits` has to keep working, which is why the list below is a `const` the
 * table of contents and the sections both read rather than two lists that agree
 * today.
 */
export const GRAPHQL_SERVER_ARTICLE_SECTIONS = [
    { id: "intro", titleKey: "introTitle" },
    { id: "schema", titleKey: "schemaTitle" },
    { id: "names", titleKey: "namesTitle" },
    { id: "relations", titleKey: "relationsTitle" },
    { id: "query", titleKey: "queryTitle" },
    { id: "mutations", titleKey: "mutationTitle" },
    { id: "limits", titleKey: "limitsTitle" },
    { id: "storage", titleKey: "storageTitle" },
    { id: "privacy", titleKey: "privacyTitle" },
    { id: "faq", titleKey: "faqTitle" },
] as const;

/**
 * The arguments every list-shaped field takes.
 *
 * A table rather than prose because there are five of them and they interact —
 * `order` does nothing without `orderBy`, and `perPage` is the one the cost
 * estimate reads. The interactions a table cannot hold follow it as a paragraph,
 * which is the shape the Base64 tool's options section established.
 */
const ARGUMENT_ROWS = [
    { id: "where", name: "where", doesKey: "argWhere", whenKey: "argWhereWhen" },
    { id: "orderBy", name: "orderBy", doesKey: "argOrderBy", whenKey: "argOrderByWhen" },
    { id: "order", name: "order", doesKey: "argOrder", whenKey: "argOrderWhen" },
    { id: "page", name: "page", doesKey: "argPage", whenKey: "argPageWhen" },
    { id: "perPage", name: "perPage", doesKey: "argPerPage", whenKey: "argPerPageWhen" },
] as const;

const FAQ_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/**
 * The FAQ, also fed to `FAQPage` structured data on the page.
 *
 * Exported so the page can emit it as JSON-LD without a second copy of the copy
 * — the same entries a reader sees are the ones a crawler is told about.
 */
export async function getGraphqlServerFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("graphqlServer.faq");

    return FAQ_KEYS.map((key) => ({
        question: t(`q${key}`),
        answer: t(`a${key}`),
    }));
}

export async function GraphqlServerArticle() {
    const [t, tToc, faqs, format] = await Promise.all([
        getTranslations("graphqlServer.article"),
        getTranslations("graphqlServer.toc"),
        getGraphqlServerFaqEntries(),
        getFormatter(),
    ]);

    const items: TocItem[] = GRAPHQL_SERVER_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));

    // Sizes read as prose here rather than as machine input, so they go through
    // the formatter and render as Bengali numerals in Bangla.
    const upload = `${format.number(Math.round(MAX_UPLOAD_BYTES / 1024))} KB`;
    const stored = `${format.number(Math.round(MAX_DOCUMENT_BYTES / 1024))} KB`;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
            {/*
                First in the DOM so the outline is reached early by a screen
                reader and by find-in-page, but `xl:order-2` puts it on the right
                — the layout every other article on the site uses. Below `xl`
                there is no room for a second column, so it is hidden rather
                than stacked above the prose.
            */}
            <aside className="hidden min-w-0 xl:order-2 xl:block">
                <ArticleToc title={tToc("title")} items={items} />
            </aside>

            <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                <ArticleSection id="intro" title={t("introTitle")}>
                    <div className={PROSE}>
                        <p>{t("introBody")}</p>
                        <ArticleExample>{t.rich("introExample", ARTICLE_TAGS)}</ArticleExample>
                        <p>{t("introSibling")}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="schema" title={t("schemaTitle")}>
                    <p className={PROSE_TEXT}>{t("schemaBody")}</p>
                </ArticleSection>

                <ArticleSection id="names" title={t("namesTitle")}>
                    <p className={PROSE_TEXT}>{t("namesBody")}</p>
                </ArticleSection>

                <ArticleSection id="relations" title={t("relationsTitle")}>
                    <p className={PROSE_TEXT}>{t("relationsBody")}</p>
                </ArticleSection>

                <ArticleSection id="query" title={t("queryTitle")}>
                    <div className={PROSE}>
                        <p>{t("queryBody")}</p>
                    </div>

                    <h3 className="text-foreground mt-6 text-sm leading-[1.3] font-semibold">
                        {t("argsTitle")}
                    </h3>

                    {/* Wide content scrolls inside its own container; the body never does. */}
                    <div className="border-border/70 mt-3 min-w-0 overflow-x-auto rounded-2xl border">
                        <table className="w-full min-w-2xl text-left text-sm">
                            <thead className="text-muted-foreground bg-muted/40 text-xs">
                                <tr>
                                    <th scope="col" className="px-3 py-2 font-medium">
                                        {t("argColumn")}
                                    </th>
                                    <th scope="col" className="px-3 py-2 font-medium">
                                        {t("doesColumn")}
                                    </th>
                                    <th scope="col" className="px-3 py-2 font-medium">
                                        {t("whenColumn")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {ARGUMENT_ROWS.map((row) => (
                                    <tr key={row.id} className="border-border/70 not-last:border-b">
                                        <td className="text-syntax-key px-3 py-2.5 align-top font-mono text-xs">
                                            {row.name}
                                        </td>
                                        <td className="text-muted-foreground px-3 py-2.5 align-top text-xs leading-relaxed">
                                            {row.id === "perPage"
                                                ? t("argPerPage", {
                                                      default: DEFAULT_PER_PAGE,
                                                      max: MAX_PER_PAGE,
                                                  })
                                                : t(row.doesKey)}
                                        </td>
                                        <td className="text-muted-foreground px-3 py-2.5 align-top text-xs leading-relaxed">
                                            {t(row.whenKey)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className={`${PROSE_TEXT} mt-4`}>{t("argsCaveat")}</p>
                </ArticleSection>

                <ArticleSection id="mutations" title={t("mutationTitle")}>
                    <p className={PROSE_TEXT}>{t("mutationBody")}</p>
                </ArticleSection>

                <ArticleSection id="limits" title={t("limitsTitle")}>
                    <p className={PROSE_TEXT}>{t("limitsBody")}</p>
                </ArticleSection>

                <ArticleSection id="storage" title={t("storageTitle")}>
                    <p className={PROSE_TEXT}>
                        {t("storageBody", {
                            upload,
                            stored,
                            warn: Math.round(DOCUMENT_WARN_RATIO * 100),
                        })}
                    </p>
                </ArticleSection>

                <ArticleSection id="privacy" title={t("privacyTitle")}>
                    <p className={PROSE_TEXT}>{t("privacyBody", { logs: MAX_LOG_ROWS })}</p>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faqTitle")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
