import { getTranslations } from "next-intl/server";

import {
    ARTICLE_TAGS,
    ArticleExample,
    ArticleSection,
    PLAIN_TAGS,
    PROSE,
} from "@/modules/tools/components/article-section";
import type { TocItem } from "@/modules/tools/components/article-toc";
import { FaqAccordion, type FaqEntry } from "@/modules/tools/components/faq-accordion";

import { MCP_RATE_LIMIT_PER_ADDRESS, MCP_RATE_LIMIT_PER_TOOL } from "../domain/rate-limit";

export const MCP_ARTICLE_SECTIONS = [
    { id: "what", titleKey: "what.title" },
    { id: "endpoint", titleKey: "endpoint.title" },
    { id: "clients", titleKey: "clients.title" },
    { id: "token", titleKey: "token.title" },
    { id: "tools", titleKey: "tools.title" },
    { id: "examples", titleKey: "examples.title" },
    { id: "limits", titleKey: "limits.title" },
    { id: "absent", titleKey: "absent.title" },
    { id: "faq", titleKey: "faq.title" },
] as const;

export async function getMcpFaqEntries(): Promise<FaqEntry[]> {
    const t = await getTranslations("mcp.article");

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
        { question: t("faq.q3"), answer: t("faq.a3") },
        {
            question: t("faq.q4"),
            answer: t.markup("faq.a4", PLAIN_TAGS),
            answerNode: t.rich("faq.a4", ARTICLE_TAGS),
        },
        { question: t("faq.q5"), answer: t("faq.a5") },
        { question: t("faq.q6"), answer: t("faq.a6") },
    ];
}

/** The table of contents, built from one list so it cannot drift from the page. */
export async function getMcpTocItems(): Promise<TocItem[]> {
    const t = await getTranslations("mcp.article");

    return MCP_ARTICLE_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.titleKey),
    }));
}

/**
 * The prose half of the page: what MCP is, what asking for a tool looks like in
 * practice, what the limits are, and what is deliberately not here.
 *
 * The "what is not here" section is not an apology. It is the disclosure rule:
 * a reader who asks their assistant to compress a photograph and is told
 * ToolForge cannot has been failed by this page, not by the endpoint. Naming
 * the three groups and why each one is absent is what turns a missing feature
 * into a known boundary.
 */
export async function McpArticle() {
    const [t, faqs] = await Promise.all([getTranslations("mcp.article"), getMcpFaqEntries()]);

    const exampleKeys = ["decode", "hash", "cron", "diff", "domain"] as const;
    const absentKeys = ["images", "studios", "ai", "scanner"] as const;

    return (
        <>
            <ArticleSection id="examples" title={t("examples.title")}>
                <div className={PROSE}>
                    <p>{t.rich("examples.p1", ARTICLE_TAGS)}</p>
                </div>
                <ul className="mt-4 flex max-w-[68ch] flex-col gap-3">
                    {exampleKeys.map((key) => (
                        <li key={key} className="flex flex-col gap-1">
                            <ArticleExample>
                                {t.rich(`examples.${key}.ask`, ARTICLE_TAGS)}
                            </ArticleExample>
                            <p className="text-muted-foreground pl-3.5 text-[0.875rem] leading-6">
                                {t.rich(`examples.${key}.runs`, ARTICLE_TAGS)}
                            </p>
                        </li>
                    ))}
                </ul>
            </ArticleSection>

            <ArticleSection id="limits" title={t("limits.title")}>
                <div className={PROSE}>
                    <p>
                        {t.rich("limits.p1", {
                            ...ARTICLE_TAGS,
                            address: () => String(MCP_RATE_LIMIT_PER_ADDRESS),
                            tool: () => String(MCP_RATE_LIMIT_PER_TOOL),
                        })}
                    </p>
                    <p>{t.rich("limits.p2", ARTICLE_TAGS)}</p>
                    <p>{t.rich("limits.p3", ARTICLE_TAGS)}</p>
                </div>
            </ArticleSection>

            <ArticleSection id="absent" title={t("absent.title")}>
                <div className={PROSE}>
                    <p>{t.rich("absent.p1", ARTICLE_TAGS)}</p>
                </div>
                <dl className="mt-4 flex max-w-[68ch] flex-col gap-4">
                    {absentKeys.map((key) => (
                        <div key={key} className="flex flex-col gap-1">
                            <dt className="text-sm font-semibold">{t(`absent.${key}.title`)}</dt>
                            <dd className="text-muted-foreground text-[0.9375rem] leading-7">
                                {t.rich(`absent.${key}.body`, ARTICLE_TAGS)}
                            </dd>
                        </div>
                    ))}
                </dl>
            </ArticleSection>

            <ArticleSection id="faq" title={t("faq.title")}>
                <FaqAccordion items={faqs} />
            </ArticleSection>
        </>
    );
}

/** The opening section, kept separate so it can sit above the connection panel. */
export async function McpIntroduction() {
    const t = await getTranslations("mcp.article");

    return (
        <ArticleSection id="what" title={t("what.title")}>
            <div className={PROSE}>
                <p>{t.rich("what.p1", ARTICLE_TAGS)}</p>
                <ArticleExample>{t.rich("what.example", ARTICLE_TAGS)}</ArticleExample>
                <p>{t.rich("what.p2", ARTICLE_TAGS)}</p>
                <p>{t.rich("what.p3", ARTICLE_TAGS)}</p>
            </div>
        </ArticleSection>
    );
}
