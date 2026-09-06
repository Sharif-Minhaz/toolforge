import { getFormatter, getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    InlineCode,
    PLAIN_TAGS,
    PROSE,
    PROSE_TEXT,
} from "@/modules/tools/components/article-section";
import { ArticleToc, type TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MAX_FILE_BYTES, MAX_SEARCH_MATCHES, MAX_SEARCH_PATTERN_BYTES } from "../domain/constants";
import { INSPECTOR_LABELS } from "../domain/inspector";

export const HEX_EDITOR_ARTICLE_SECTIONS = [
    { id: "understanding", titleKey: "understanding.title" },
    { id: "grid", titleKey: "grid.title" },
    { id: "editing", titleKey: "editing.title" },
    { id: "inspector", titleKey: "inspector.title" },
    { id: "searching", titleKey: "searching.title" },
    { id: "shortcuts", titleKey: "shortcuts.title" },
    { id: "saving", titleKey: "saving.title" },
    { id: "useCases", titleKey: "useCases.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

/**
 * A literal tuple, so every `shortcuts.<row>` below is checked at compile time.
 * The key combinations themselves are data and stay out of the catalogue — a
 * translated `Ctrl` is a key nobody's keyboard has.
 */
const SHORTCUT_ROWS = [
    { key: "open", combo: "Ctrl+O" },
    { key: "save", combo: "Ctrl+S" },
    { key: "saveAs", combo: "Ctrl+Shift+S" },
    { key: "find", combo: "Ctrl+F" },
    { key: "goTo", combo: "Ctrl+G" },
    { key: "undo", combo: "Ctrl+Z" },
    { key: "redo", combo: "Ctrl+Y" },
    { key: "column", combo: "Tab" },
    { key: "move", combo: "↑ ↓ ← →" },
    { key: "extend", combo: "Shift + ↑ ↓ ← →" },
    { key: "selectAll", combo: "Ctrl+A" },
    { key: "rowEnds", combo: "Home / End" },
    { key: "documentEnds", combo: "Ctrl+Home / Ctrl+End" },
    { key: "page", combo: "Page Up / Page Down" },
    { key: "zero", combo: "Delete" },
    { key: "back", combo: "Backspace" },
] as const;

/** The reading families the inspector groups into, for the prose that names them. */
const INSPECTOR_FAMILIES = ["integers", "floats", "text", "guid"] as const;

export async function getHexEditorFaqEntries(): Promise<FaqEntry[]> {
    const [t, formatter] = await Promise.all([
        getTranslations("hexEditor.article"),
        getFormatter(),
    ]);

    return [
        { question: t("faq.q1"), answer: t("faq.a1") },
        {
            question: t("faq.q2"),
            answer: t.markup("faq.a2", PLAIN_TAGS),
            answerNode: t.rich("faq.a2", ARTICLE_TAGS),
        },
        { question: t("faq.q3"), answer: t("faq.a3") },
        {
            question: t("faq.q4"),
            answer: t("faq.a4", {
                max: formatter.number(Math.floor(MAX_FILE_BYTES / 1024 / 1024)),
            }),
        },
        { question: t("faq.q5"), answer: t("faq.a5") },
        {
            question: t("faq.q6"),
            answer: t.markup("faq.a6", PLAIN_TAGS),
            answerNode: t.rich("faq.a6", ARTICLE_TAGS),
        },
    ];
}

export async function HexEditorArticle() {
    const [t, tToc, faqs, formatter] = await Promise.all([
        getTranslations("hexEditor.article"),
        getTranslations("hexEditor.toc"),
        getHexEditorFaqEntries(),
        getFormatter(),
    ]);

    const tocItems: TocItem[] = HEX_EDITOR_ARTICLE_SECTIONS.map((section) => ({
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
                            <span className="font-mono">00000020</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-mono">48 65 6C 6C 6F 20 FF 00</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-mono">Hello ..</span>
                        </ArticleExample>
                        <p>{t.rich("understanding.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="grid" title={t("grid.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("grid.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("grid.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("grid.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="editing" title={t("editing.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("editing.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            <InlineCode>4D</InlineCode>
                            <span aria-hidden="true">→</span>
                            <span>{t("editing.exampleTypeA")}</span>
                            <InlineCode>A_</InlineCode>
                            <span aria-hidden="true">→</span>
                            <span>{t("editing.exampleTypeF")}</span>
                            <InlineCode>AF</InlineCode>
                        </ArticleExample>
                        <p>{t.rich("editing.p2", ARTICLE_TAGS)}</p>
                        <p>{t.rich("editing.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="inspector" title={t("inspector.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("inspector.p1", ARTICLE_TAGS)}</p>
                        <ul className="flex flex-col gap-2">
                            {INSPECTOR_FAMILIES.map((family) => (
                                <li key={family} className="flex flex-col gap-0.5">
                                    <span className="text-foreground font-medium">
                                        {t(`inspector.${family}Name`)}
                                    </span>
                                    <span>{t.rich(`inspector.${family}Body`, ARTICLE_TAGS)}</span>
                                </li>
                            ))}
                        </ul>
                        <p>{t.rich("inspector.p2", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            <InlineCode>00 11 22 33 …</InlineCode>
                            <span aria-hidden="true">→</span>
                            <span className="font-mono text-xs">00112233-4455-…</span>
                            <span className="text-muted-foreground">{t("inspector.orBig")}</span>
                            <span className="font-mono text-xs">33221100-5544-…</span>
                        </ArticleExample>
                        <p className={PROSE_TEXT}>
                            {t("inspector.rows", {
                                count: Object.keys(INSPECTOR_LABELS).length,
                            })}
                        </p>
                    </div>
                </ArticleSection>

                <ArticleSection id="searching" title={t("searching.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("searching.p1", ARTICLE_TAGS)}</p>
                        <ArticleExample>
                            <InlineCode>Hello</InlineCode>
                            <span className="text-muted-foreground">{t("searching.or")}</span>
                            <InlineCode>48 65 6C 6C 6F</InlineCode>
                        </ArticleExample>
                        <p>
                            {t("searching.p2", {
                                maxBytes: formatter.number(MAX_SEARCH_PATTERN_BYTES),
                                maxMatches: formatter.number(MAX_SEARCH_MATCHES),
                            })}
                        </p>
                        <p>{t.rich("searching.p3", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="shortcuts" title={t("shortcuts.title")}>
                    <div className="flex flex-col gap-4">
                        <p className={PROSE_TEXT}>{t("shortcuts.intro")}</p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[28rem] text-left text-[0.875rem]">
                                <thead className="text-muted-foreground/85 text-[0.6875rem] tracking-[0.06em] uppercase">
                                    <tr className="border-border/70 border-b">
                                        <th scope="col" className="py-2 pr-4 font-semibold">
                                            {t("shortcuts.columnKey")}
                                        </th>
                                        <th scope="col" className="py-2 font-semibold">
                                            {t("shortcuts.columnDoes")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-muted-foreground">
                                    {SHORTCUT_ROWS.map((row) => (
                                        <tr key={row.key} className="border-border/45 border-b">
                                            <td className="py-2 pr-4 align-top whitespace-nowrap">
                                                <InlineCode>{row.combo}</InlineCode>
                                            </td>
                                            <td className="py-2 align-top leading-6">
                                                {t(`shortcuts.${row.key}`)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </ArticleSection>

                <ArticleSection id="saving" title={t("saving.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("saving.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("saving.p2", ARTICLE_TAGS)}</p>
                        <p>
                            {t("saving.p3", {
                                max: formatter.number(Math.floor(MAX_FILE_BYTES / 1024 / 1024)),
                            })}
                        </p>
                    </div>
                </ArticleSection>

                <ArticleSection id="useCases" title={t("useCases.title")}>
                    <div className={PROSE}>
                        <p>{t.rich("useCases.p1", ARTICLE_TAGS)}</p>
                        <p>{t.rich("useCases.p2", ARTICLE_TAGS)}</p>
                    </div>
                </ArticleSection>

                <ArticleSection id="faq" title={t("faq.title")}>
                    <FaqAccordion items={faqs} />
                </ArticleSection>
            </article>
        </div>
    );
}
