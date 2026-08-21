import { Marked, type Token, type Tokens } from "marked";

import { escapeHtml } from "@/modules/tools/domain/html-escape";
import type { HtmlMarkdownOptions } from "../types";
import { FALLBACK_DOCUMENT_TITLE } from "./constants";

/**
 * Markdown in, HTML out, through Marked — the same parser the Markdown preview
 * already depends on, for the same reason: the output is read by something that
 * is not this site.
 *
 * The preview deliberately never builds an HTML *string*; it turns Marked's
 * tokens into React elements so nothing an author typed can reach
 * `dangerouslySetInnerHTML`. This tool is the opposite job — the string is what
 * the reader asked for — so the safety argument has to be made somewhere else,
 * and it is: the result is shown in a read-only text box and written to a
 * downloaded file. Nothing on this origin ever renders it.
 */

function createParser(options: HtmlMarkdownOptions): Marked {
    return new Marked({ gfm: options.gfm, breaks: options.lineBreaks });
}

function isHeading(token: Token): token is Tokens.Heading {
    return token.type === "heading";
}

/**
 * The document's own first heading, for the `<title>` of a standalone file.
 *
 * Taken from the token stream rather than a regular expression over the source,
 * so a `#` inside a fenced code block is not mistaken for one — the lexer has
 * already decided that question and is not going to disagree with the parser
 * that runs next.
 */
export function readDocumentTitle(markdown: string, options: HtmlMarkdownOptions): string {
    const heading = createParser(options).lexer(markdown).find(isHeading);
    const title = heading?.text.trim() ?? "";

    return title.length > 0 ? title : FALLBACK_DOCUMENT_TITLE;
}

/**
 * A minimal, unstyled shell — a charset, a viewport, a title, and the markup.
 *
 * Deliberately not the Markdown tool's styled export. That one is a finished
 * artefact for a reader; this is a file somebody is about to drop their own
 * stylesheet on top of, and typography they did not ask for would be the first
 * thing they had to delete.
 *
 * `lang` is `en` because the file has to declare one and nothing here knows the
 * document's language — the reader's interface locale is not the same question.
 * The article says so, and says to change it.
 */
function wrapDocument(body: string, title: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body.trimEnd()}
</body>
</html>
`;
}

export function markdownToHtml(markdown: string, options: HtmlMarkdownOptions): string | null {
    try {
        // `async: false` is both the truth and the narrowing: no extension here
        // is asynchronous, and the overload it selects returns a string rather
        // than a union nobody downstream could use.
        const html = createParser(options).parse(markdown, { async: false });

        return options.fullDocument
            ? wrapDocument(html, readDocumentTitle(markdown, options))
            : html;
    } catch {
        // Marked throws on input it cannot lex at all. The reader gets a named
        // refusal rather than a parser's message about its own internals.
        return null;
    }
}
