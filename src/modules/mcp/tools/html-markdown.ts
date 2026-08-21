import { z } from "zod";

import {
    DEFAULT_HTML_MARKDOWN_MODE,
    DEFAULT_HTML_MARKDOWN_OPTIONS,
} from "@/modules/html-markdown/domain/constants";
import { convert } from "@/modules/html-markdown/domain/convert";
import {
    bulletMarkerSchema,
    codeBlockStyleSchema,
    emphasisStyleSchema,
    headingStyleSchema,
    htmlMarkdownModeSchema,
    linkStyleSchema,
} from "@/modules/html-markdown/validation/conversion-options";

import { MAX_MCP_TEXT_LENGTH } from "../domain/constants";
import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * HTML and Markdown, in both directions.
 *
 * The most useful tool on this endpoint for a model that has just fetched a
 * page: an article as HTML is mostly tags, and the same article as Markdown is
 * mostly the article. `removed` is returned rather than dropped, because a
 * caller that asked for a page's prose deserves to know a script came with it
 * and did not become part of the answer.
 *
 * Every option that only one direction reads is still accepted in both, and
 * ignored in the one that has nothing to do with it — the page hides those
 * controls, but a program has no panel to look at and refusing an argument that
 * is merely irrelevant would make the schema harder to call, not safer.
 */
export const htmlMarkdownConvertTool = defineMcpTool({
    toolId: "html-markdown",
    verb: "convert",
    title: "Convert between HTML and Markdown",
    description:
        "Turn HTML into Markdown or Markdown into HTML. Handles GitHub Flavored Markdown — tables, strikethrough, task lists — and controls how the Markdown is written: ATX or setext headings, the bullet character, fenced or indented code, the emphasis delimiter, and inline or reference links. Script, style and head content is dropped rather than flattened into prose, and every element dropped is listed in `removed`.",
    kind: "offline",
    inputSchema: z.object({
        mode: htmlMarkdownModeSchema
            .default(DEFAULT_HTML_MARKDOWN_MODE)
            .describe("`htmlToMarkdown` reads HTML, `markdownToHtml` reads Markdown"),
        text: z
            .string()
            .max(MAX_MCP_TEXT_LENGTH)
            .describe("HTML when converting to Markdown, Markdown when converting to HTML"),
        gfm: z
            .boolean()
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.gfm)
            .describe("Tables, strikethrough and task lists. Read in both directions"),
        headingStyle: headingStyleSchema
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.headingStyle)
            .describe("`atx` writes `# Title`; `setext` underlines the first two levels"),
        bulletMarker: bulletMarkerSchema
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.bulletMarker)
            .describe("The character an unordered list item starts with"),
        codeBlockStyle: codeBlockStyleSchema
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.codeBlockStyle)
            .describe("`indented` cannot carry a language; `fenced` can"),
        emphasisStyle: emphasisStyleSchema
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.emphasisStyle)
            .describe("The delimiter around emphasis. Strong is always `**`"),
        linkStyle: linkStyleSchema
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.linkStyle)
            .describe("`referenced` collects addresses at the end of the document"),
        keepUnsupportedHtml: z
            .boolean()
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.keepUnsupportedHtml)
            .describe("Keep `<sub>`, `<kbd>`, `<details>` as tags instead of unwrapping them"),
        lineBreaks: z
            .boolean()
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.lineBreaks)
            .describe("Turn a single newline into `<br>`. Markdown to HTML only"),
        fullDocument: z
            .boolean()
            .default(DEFAULT_HTML_MARKDOWN_OPTIONS.fullDocument)
            .describe("Wrap the markup in a standalone file. Markdown to HTML only"),
    }),
    run: ({ mode, text, ...options }) => {
        const result = convert({ mode, text, options });

        if (!result.ok) {
            return refuseWithReason("HTML / Markdown", result.reason);
        }

        return succeed(
            `Converted ${result.inputBytes} bytes to ${mode === "htmlToMarkdown" ? "Markdown" : "HTML"}`,
            {
                output: result.output,
                mode,
                inputBytes: result.inputBytes,
                outputBytes: result.outputBytes,
                removed: [...result.removed],
            },
        );
    },
});
