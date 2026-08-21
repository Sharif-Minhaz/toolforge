import { Marked } from "marked";

import type { PdfConversionNotes } from "../types";
import { readHtml, type HtmlReadOptions, type HtmlReadResult } from "./read-html";

/**
 * Markdown and MDX both become HTML first, and then blocks.
 *
 * Marked writes the HTML, for the reason decision tree 45 gives and the
 * Markdown preview already relies on: CommonMark plus GitHub's extensions is a
 * specification with a settled implementation, and a second one written here
 * would differ from it in somebody's README rather than in a test.
 *
 * Nothing on this origin ever renders the string Marked produces. It is parsed
 * straight back into blocks by `read-html.ts` and then drawn into a PDF, so the
 * usual `dangerouslySetInnerHTML` argument has no surface to land on.
 */

export type MdxStrip = PdfConversionNotes["strippedMdx"][number];

export type MarkdownReadResult = HtmlReadResult & {
    /** The document's own title — front matter first, then its first heading. */
    readonly title: string | null;
    readonly strippedMdx: readonly MdxStrip[];
};

/** YAML front matter, which is metadata about the document rather than the document. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * ES module syntax at the start of a line.
 *
 * Anchored to a line start and matched only outside fenced code, so a README
 * showing `import { useState } from "react"` inside a fence keeps it. That is
 * the case worth protecting: most MDX that reaches a PDF converter is
 * documentation *about* imports.
 */
const MODULE_STATEMENT = /^(import|export)\s[^\n]*(\n(?![\s\S])|\n)/gm;

/**
 * A JSX element, recognised by the one rule MDX itself uses: a component starts
 * with a capital letter or carries a dot. `<div>` is HTML and stays; `<Callout>`
 * and `<Chart.Bar>` are code this tool cannot run, and their markup in the
 * middle of a paragraph is worse than their absence.
 */
const JSX_ELEMENT = /<([A-Z][\w.]*|[a-z]\w*\.[\w.]+)(\s[^>]*?)?(\/>|>[\s\S]*?<\/\1\s*>)/g;

/** A brace expression on its own line, such as `{frontmatter.title}` or a JSX comment. */
const JSX_EXPRESSION = /^[ \t]*\{[\s\S]*?\}[ \t]*$/gm;

/** Everything inside a fence or an indented block, protected from the rules above. */
const PROTECTED = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

function readFrontMatterTitle(block: string): string | null {
    const match = /^title:\s*(.+)$/m.exec(block);
    const raw = match?.[1]?.trim() ?? "";
    const title = raw.replace(/^["']|["']$/g, "").trim();

    return title.length > 0 ? title : null;
}

/**
 * Runs a replacement over everything that is not code.
 *
 * The alternative — running it over the whole document — is how a converter
 * ends up deleting the one line a tutorial exists to show.
 */
function outsideCode(source: string, apply: (chunk: string) => string): string {
    const parts = source.split(PROTECTED);

    return parts.map((part, index) => (index % 2 === 1 ? part : apply(part))).join("");
}

export type MdxStripResult = {
    readonly markdown: string;
    readonly stripped: readonly MdxStrip[];
};

/**
 * MDX reduced to the Markdown underneath it.
 *
 * A component is a function this tool cannot call, so there is no honest way to
 * draw one. Every kind removed is reported rather than swallowed — the reader
 * finding a missing chart in a printed PDF is a worse discovery than being told
 * at conversion time.
 */
export function stripMdxSyntax(source: string): MdxStripResult {
    const stripped = new Set<MdxStrip>();

    const withoutModules = outsideCode(source, (chunk) =>
        chunk.replace(MODULE_STATEMENT, (match) => {
            stripped.add(match.startsWith("export") ? "export" : "import");

            return "";
        }),
    );

    const withoutElements = outsideCode(withoutModules, (chunk) =>
        chunk.replace(JSX_ELEMENT, () => {
            stripped.add("jsx");

            return "";
        }),
    );

    const withoutExpressions = outsideCode(withoutElements, (chunk) =>
        chunk.replace(JSX_EXPRESSION, () => {
            stripped.add("expression");

            return "";
        }),
    );

    return {
        markdown: withoutExpressions.replace(/\n{3,}/g, "\n\n"),
        stripped: [...stripped],
    };
}

export type MarkdownReadOptions = HtmlReadOptions & {
    /** MDX is stripped first; plain Markdown keeps every angle bracket it has. */
    readonly mdx: boolean;
};

export function readMarkdown(source: string, options: MarkdownReadOptions): MarkdownReadResult {
    const matter = FRONT_MATTER.exec(source);
    const body = matter === null ? source : source.slice(matter[0].length);
    const title = matter === null ? null : readFrontMatterTitle(matter[1]);

    const { markdown, stripped } = options.mdx
        ? stripMdxSyntax(body)
        : { markdown: body, stripped: [] as readonly MdxStrip[] };

    // `async: false` is both the truth and the narrowing — no extension here is
    // asynchronous, and the overload it selects returns a string rather than a
    // union nothing downstream could use.
    const html = new Marked({ gfm: true, breaks: false }).parse(markdown, { async: false });

    return { ...readHtml(html, options), title, strippedMdx: stripped };
}
