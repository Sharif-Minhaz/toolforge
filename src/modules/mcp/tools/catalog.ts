import { z } from "zod";

import messages from "@/messages/en.json";
import { absoluteUrl } from "@/modules/seo/domain/site";
import { getTools } from "@/modules/tools/domain/tool-catalog";
import { TOOL_CATEGORIES } from "@/modules/tools/types";

import { defineMcpTool } from "../domain/define-tool";
import { succeed } from "../domain/result";

/**
 * Every tool ToolForge has, including the ones this endpoint cannot run.
 *
 * That inclusion is the point. The image tools compress and convert in the tab,
 * on WebAssembly, against pixels the browser decoded — none of which exists in
 * a request handler, and a server-side reimplementation would be a second codec
 * to keep in step with the first. So instead of pretending, this hands back the
 * address, and a model asked to shrink a photograph can send its reader to the
 * page that does it rather than reporting that ToolForge cannot.
 *
 * Names and descriptions come from the English catalogue, read as data rather
 * than through `next-intl`. The reasoning is in `domain/result.ts`: what
 * crosses this boundary is protocol payload for a model, and what the person
 * eventually reads is the assistant's own reply in their own language.
 */

const catalogue: Record<string, { name?: string; description?: string }> = messages.tools;

export const catalogListTool = defineMcpTool({
    toolId: "catalog",
    verb: "list",
    title: "List ToolForge tools",
    description:
        "List every tool ToolForge offers, with its web address, category and search keywords. Includes tools this MCP server cannot run — the image compressor, converter and resizer work on pixels in a browser tab — so that a request this endpoint cannot serve can still be answered with the page that serves it.",
    kind: "offline",
    inputSchema: z.object({
        category: z
            .enum(TOOL_CATEGORIES)
            .optional()
            .describe("Narrow to one category. Omit for everything"),
        query: z
            .string()
            .max(120)
            .default("")
            .describe("Match against tool id and keywords, case-insensitively"),
    }),
    run: ({ category, query }) => {
        const needle = query.trim().toLowerCase();

        const tools = getTools()
            .filter((tool) => category === undefined || tool.category === category)
            .filter(
                (tool) =>
                    needle.length === 0 ||
                    tool.id.includes(needle) ||
                    tool.keywords.some((keyword) => keyword.includes(needle)),
            )
            .map((tool) => ({
                id: tool.id,
                name: catalogue[tool.id]?.name ?? tool.id,
                description: catalogue[tool.id]?.description ?? null,
                url: absoluteUrl(tool.href),
                category: tool.category,
                status: tool.status,
                // `browser` and `hybrid` tools have no MCP equivalent for the
                // part that needs a canvas. Saying so is more useful than
                // leaving a caller to discover it by absence.
                runsOn: tool.runsOn,
                keywords: [...tool.keywords],
            }));

        return succeed(`${tools.length} tools`, { tools });
    },
});
