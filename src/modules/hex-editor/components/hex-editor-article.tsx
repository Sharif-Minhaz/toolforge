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
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";
import { MAX_FILE_BYTES } from "../domain/constants";

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
    const [t, faqs] = await Promise.all([
        getTranslations("hexEditor.article"),
        getHexEditorFaqEntries(),
        ,
    ]);

    return (
        <article className="flex min-w-0 flex-col gap-12">
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

            <ArticleSection id="shortcuts" title={t("shortcuts.title")}>
                <div className="flex flex-col gap-4">
                    <p className={PROSE_TEXT}>{t("shortcuts.intro")}</p>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[28rem] text-left text-[0.875rem]">
                            <thead className="text-muted-foreground/85 text-xs tracking-[0.06em]">
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

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </article>
    );
}
