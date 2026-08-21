import type { DownloadFile } from "@/modules/tools/types";
import type { HtmlMarkdownExportRequest, HtmlMarkdownMode } from "../types";
import { HTML_MIME_TYPE, MARKDOWN_MIME_TYPE } from "./constants";

/** The direction names what came out, never what went in. */
const EXTENSIONS: Record<HtmlMarkdownMode, "md" | "html"> = {
    htmlToMarkdown: "md",
    markdownToHtml: "html",
};

const MIME_TYPES: Record<HtmlMarkdownMode, string> = {
    htmlToMarkdown: MARKDOWN_MIME_TYPE,
    markdownToHtml: HTML_MIME_TYPE,
};

/** `converted-20260821T101500Z.md` — sortable and self-describing. */
export function buildHtmlMarkdownExportFilename(mode: HtmlMarkdownMode, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `converted-${stamp}.${EXTENSIONS[mode]}`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

export function createHtmlMarkdownExportFile(request: HtmlMarkdownExportRequest): DownloadFile {
    return {
        filename: buildHtmlMarkdownExportFilename(request.mode, request.generatedAt),
        mimeType: MIME_TYPES[request.mode],
        content: withTrailingNewline(request.content),
    };
}
