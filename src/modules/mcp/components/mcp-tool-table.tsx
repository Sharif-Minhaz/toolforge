import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ArticleSection, InlineCode, PROSE } from "@/modules/tools/components/article-section";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

import { MCP_TOOLS } from "../tools";

/**
 * Every tool this endpoint publishes, read from the registry rather than
 * written out.
 *
 * The table cannot go stale, which is the point: a tool added to
 * `tools/index.ts` appears here in the same change, and one removed disappears.
 * A hand-written list of twenty-eight names is a promise nobody keeps past the
 * second release.
 *
 * The catalogue link is what makes the table more than a listing — somebody
 * reading `toolforge_cron_explain` and wanting to know what it does in detail
 * goes to the page that documents every option of it.
 */
export async function McpToolTable() {
    // The heading is the same string the table of contents shows, so it is read
    // from where the contents reads it rather than kept in a second key.
    const [t, tSection, tTools] = await Promise.all([
        getTranslations("mcp.tools"),
        getTranslations("mcp.article"),
        getTranslations("tools"),
    ]);

    return (
        <ArticleSection id="tools" title={tSection("tools.title")}>
            <div className={PROSE}>
                <p>{t("body", { count: MCP_TOOLS.length })}</p>
            </div>

            <div className="ring-border/70 mt-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                <table className="w-full min-w-2xl border-collapse text-left text-sm">
                    <thead className="bg-muted/45 text-muted-foreground">
                        <tr>
                            <th scope="col" className="px-4 py-2.5 font-medium">
                                {t("columnName")}
                            </th>
                            <th scope="col" className="px-4 py-2.5 font-medium">
                                {t("columnTool")}
                            </th>
                            <th scope="col" className="px-4 py-2.5 font-medium">
                                {t("columnAccess")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {MCP_TOOLS.map((tool) => {
                            return (
                                <tr key={tool.name} className="border-border/60 border-t">
                                    <td className="px-4 py-2.5 align-top">
                                        <InlineCode>{tool.name}</InlineCode>
                                        <span className="text-muted-foreground mt-1.5 block text-[0.8125rem] leading-6">
                                            {tool.title}
                                        </span>
                                    </td>
                                    <td className="text-muted-foreground px-4 py-2.5 align-top">
                                        {/* Narrowed by the comparison rather than
                                            by a lookup, so the message key below
                                            stays a literal union. */}
                                        {tool.toolId === "catalog" ? (
                                            t("catalogRow")
                                        ) : (
                                            <Link
                                                href={getToolById(tool.toolId)?.href ?? "/"}
                                                className="hover:text-foreground focus-visible:ring-ring rounded underline underline-offset-4 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                            >
                                                {tTools(`${tool.toolId}.name`)}
                                            </Link>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 align-top">
                                        <span
                                            className={
                                                tool.kind === "network"
                                                    ? "inline-flex items-center rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
                                                    : "bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                            }
                                        >
                                            {t(`access.${tool.kind}`)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </ArticleSection>
    );
}
