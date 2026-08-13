import { z } from "zod";

import { MAX_MARKDOWN_LENGTH } from "@/modules/markdown/domain/constants";
import { parseMarkdown } from "@/modules/markdown/domain/parse";
import { describeDocument } from "@/modules/markdown/domain/statistics";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The document's shape and size, not its rendered HTML.
 *
 * Rendering happens in React components, so there is no `toHtml` in `domain/`
 * to call and inventing one here would be a second renderer that drifts from
 * the one on screen. What the parser does own is the outline, the anchor ids
 * and the counts — which is the half a caller cannot compute reliably with a
 * regular expression, and the half that answers "what is in this README".
 */
export const markdownAnalyzeTool = defineMcpTool({
    toolId: "markdown",
    verb: "analyze",
    title: "Analyse a Markdown document",
    description:
        "Parse GitHub-flavoured Markdown and return its heading outline with the anchor id each heading will get, plus word and character counts, line count and reading time, and whether the document contains Mermaid diagrams or KaTeX maths. Use it to summarise or link into a document; it does not render HTML.",
    kind: "offline",
    inputSchema: z.object({
        markdown: z.string().max(MAX_MARKDOWN_LENGTH).describe("The Markdown source"),
    }),
    run: ({ markdown }) => {
        const parsed = parseMarkdown(markdown);

        if (!parsed.ok) {
            return refuseWithReason("Markdown parser", parsed.reason);
        }

        const statistics = describeDocument(markdown);

        return succeed(
            `${parsed.document.outline.length} headings, ${statistics.words} words, ~${statistics.readingMinutes} min read`,
            {
                outline: parsed.document.outline.map((entry) => ({
                    id: entry.id,
                    depth: entry.depth,
                    title: entry.title,
                })),
                statistics: { ...statistics },
                hasDiagrams: parsed.document.hasDiagrams,
                hasMath: parsed.document.hasMath,
                blockCount: parsed.document.blocks.length,
            },
        );
    },
});
