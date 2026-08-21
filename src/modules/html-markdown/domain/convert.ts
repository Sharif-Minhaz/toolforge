import { getByteLength } from "@/modules/tools/domain/byte-size";
import type { HtmlMarkdownMode, HtmlMarkdownOptions, HtmlMarkdownResult } from "../types";
import { MAX_HTML_MARKDOWN_INPUT_BYTES } from "./constants";
import { markdownToHtml } from "./to-html";
import { htmlToMarkdown } from "./to-markdown";

export type HtmlMarkdownConversionRequest = {
    readonly mode: HtmlMarkdownMode;
    readonly text: string;
    readonly options: HtmlMarkdownOptions;
};

export function exceedsInputLimit(bytes: number): boolean {
    return bytes > MAX_HTML_MARKDOWN_INPUT_BYTES;
}

/**
 * Which options the reader is actually looking at.
 *
 * Nine switches, and each one belongs to a direction — a bullet character has
 * nothing to say while Markdown is being turned into HTML, and `<br>` on every
 * newline has nothing to say on the way back. One predicate rather than two
 * lists, so the panel that hides a control and the article that documents it
 * cannot drift apart.
 */
export function appliesTo(option: keyof HtmlMarkdownOptions, mode: HtmlMarkdownMode): boolean {
    switch (option) {
        // Read in both directions: with it off, an HTML table flattens on the
        // way out and a pipe table stays literal text on the way in.
        case "gfm":
            return true;
        case "lineBreaks":
        case "fullDocument":
            return mode === "markdownToHtml";
        default:
            return mode === "htmlToMarkdown";
    }
}

/**
 * Whether a fenced block's language survives.
 *
 * `<pre><code class="language-ts">` carries a language; four spaces of
 * indentation is a block with nowhere to put one. The control is not disabled
 * for it — indented blocks are a legitimate thing to want — but the reader is
 * told what the choice costs rather than finding out from a diff later.
 */
export function keepsCodeLanguage(options: HtmlMarkdownOptions): boolean {
    return options.codeBlockStyle === "fenced";
}

/**
 * The one conversion the whole tool runs, shared by the server-rendered first
 * pass, every settled keystroke afterwards, and the MCP adapter.
 *
 * Pure and deterministic: the same request always produces the same bytes.
 */
export function convert(request: HtmlMarkdownConversionRequest): HtmlMarkdownResult {
    const { mode, text, options } = request;
    const inputBytes = getByteLength(text);

    if (exceedsInputLimit(inputBytes)) {
        return { ok: false, reason: "too_large" };
    }

    if (mode === "markdownToHtml") {
        const html = markdownToHtml(text, options);

        return html === null
            ? { ok: false, reason: "unconvertible" }
            : { ok: true, output: html, inputBytes, outputBytes: getByteLength(html), removed: [] };
    }

    const converted = htmlToMarkdown(text, options);

    if (converted === null) {
        return { ok: false, reason: "unconvertible" };
    }

    return {
        ok: true,
        output: converted.markdown,
        inputBytes,
        outputBytes: getByteLength(converted.markdown),
        removed: converted.removed,
    };
}
