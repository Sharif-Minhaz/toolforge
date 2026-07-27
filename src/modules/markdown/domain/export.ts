import katex from "katex";

import type { DownloadFile } from "@/modules/tools/types";
import type { MarkdownExportFormat, MarkdownExportRequest } from "../types";

const MIME_TYPES: Record<MarkdownExportFormat, string> = {
    markdown: "text/markdown;charset=utf-8",
    html: "text/html;charset=utf-8",
};

const EXTENSIONS: Record<MarkdownExportFormat, string> = {
    markdown: "md",
    html: "html",
};

/** Pinned to the version that produced the markup, so the two cannot drift. */
const KATEX_STYLESHEET = `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css`;

/**
 * Typography for a document that has left the site and no longer has the design
 * tokens. Kept deliberately plain — the export is a readable artefact, not a
 * copy of the app's chrome — and it honours the reader's colour scheme.
 */
const DOCUMENT_STYLES = `:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0 auto;padding:2.5rem 1.25rem 4rem;max-width:52rem;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:1rem;line-height:1.7;color:#1c1d22;background:#fff}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:2rem 0 .75rem;font-weight:650}
h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.25rem}
p,ul,ol,blockquote,table,pre{margin:0 0 1rem}
a{color:#4c46d6}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875em;background:#f1f1f5;padding:.15em .35em;border-radius:.3rem}
pre{background:#f1f1f5;padding:1rem;border-radius:.6rem;overflow-x:auto}
pre code{background:none;padding:0}
blockquote{border-left:3px solid #d5d5de;padding:.25rem 0 .25rem 1rem;color:#55565f;margin-left:0}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
th,td{border:1px solid #d5d5de;padding:.5rem .75rem;text-align:left}
th{background:#f1f1f5}
img{max-width:100%;height:auto}
hr{border:0;border-top:1px solid #d5d5de;margin:2rem 0}
svg{max-width:100%;height:auto}
@media (prefers-color-scheme:dark){
body{color:#e8e8ec;background:#16171b}
a{color:#9d97ff}
code,pre,th{background:#24252b}
blockquote{border-left-color:#3a3b44;color:#a4a5ad}
th,td{border-color:#3a3b44}
hr{border-top-color:#3a3b44}
}`;

const ESCAPES: Readonly<Record<string, string>> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (character) => ESCAPES[character]);
}

/** `markdown-20260728T101500Z.md` — sortable and self-describing. */
export function buildMarkdownExportFilename(
    format: MarkdownExportFormat,
    generatedAt: Date,
): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `markdown-${stamp}.${EXTENSIONS[format]}`;
}

function withTrailingNewline(content: string): string {
    if (content.length === 0 || content.endsWith("\n")) {
        return content;
    }

    return `${content}\n`;
}

/**
 * Wraps the preview's own markup in a standalone document.
 *
 * `body` is the serialised preview, which React produced from the parsed nodes
 * — so it is already escaped by the time it arrives here. Nothing the author
 * typed is interpolated raw.
 */
function buildHtmlDocument(request: MarkdownExportRequest): string {
    const styles = request.includeMathStyles
        ? `${DOCUMENT_STYLES}\n.katex-display{overflow-x:auto;overflow-y:hidden;padding:.25rem 0}`
        : DOCUMENT_STYLES;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(request.title)}</title>
${request.includeMathStyles ? `<link rel="stylesheet" href="${KATEX_STYLESHEET}">\n` : ""}<style>
${styles}
</style>
</head>
<body>
${request.renderedHtml ?? ""}
</body>
</html>
`;
}

export function createMarkdownExportFile(request: MarkdownExportRequest): DownloadFile {
    return {
        filename: buildMarkdownExportFilename(request.format, request.generatedAt),
        mimeType: MIME_TYPES[request.format],
        content:
            request.format === "markdown"
                ? withTrailingNewline(request.source)
                : buildHtmlDocument(request),
    };
}
