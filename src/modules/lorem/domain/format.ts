import type { LoremFormat } from "../types";

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * The corpora carry no markup, but a reader pasting output into a template
 * should never be the one to discover that. Escaping is unconditional.
 */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/** One rendered block per paragraph, in the requested format. */
export function renderBlocks(
    paragraphs: readonly string[],
    format: LoremFormat,
): readonly string[] {
    if (format === "html") {
        return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`);
    }

    return [...paragraphs];
}

/**
 * Plain paragraphs need a blank line between them to read as paragraphs at
 * all; `<p>` elements carry that meaning themselves, so one newline is enough.
 */
export function joinBlocks(blocks: readonly string[], format: LoremFormat): string {
    return blocks.join(format === "html" ? "\n" : "\n\n");
}
