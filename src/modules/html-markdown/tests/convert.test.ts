import { describe, expect, test } from "bun:test";

import {
    appliesTo,
    convert,
    exceedsInputLimit,
    keepsCodeLanguage,
} from "@/modules/html-markdown/domain/convert";
import {
    DEFAULT_HTML_MARKDOWN_OPTIONS,
    MAX_HTML_MARKDOWN_INPUT_BYTES,
} from "@/modules/html-markdown/domain/constants";
import type { HtmlMarkdownOptions } from "@/modules/html-markdown/types";

function options(overrides: Partial<HtmlMarkdownOptions> = {}): HtmlMarkdownOptions {
    return { ...DEFAULT_HTML_MARKDOWN_OPTIONS, ...overrides };
}

function toMarkdown(html: string, overrides: Partial<HtmlMarkdownOptions> = {}): string {
    const result = convert({ mode: "htmlToMarkdown", text: html, options: options(overrides) });

    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result.output;
}

function toHtml(markdown: string, overrides: Partial<HtmlMarkdownOptions> = {}): string {
    const result = convert({
        mode: "markdownToHtml",
        text: markdown,
        options: options(overrides),
    });

    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result.output;
}

describe("HTML to Markdown", () => {
    test("writes headings, emphasis, and inline code", () => {
        expect(toMarkdown("<h1>Title</h1>")).toBe("# Title");
        expect(toMarkdown("<p><strong>bold</strong> and <em>italic</em></p>")).toBe(
            "**bold** and _italic_",
        );
        expect(toMarkdown("<p><code>fetch()</code></p>")).toBe("`fetch()`");
    });

    test("keeps a fenced block's language, which is why fences are the default", () => {
        expect(toMarkdown(`<pre><code class="language-ts">const a = 1;</code></pre>`)).toBe(
            "```ts\nconst a = 1;\n```",
        );
    });

    test("loses the language when the reader asks for indented blocks", () => {
        const indented = toMarkdown(`<pre><code class="language-ts">const a = 1;</code></pre>`, {
            codeBlockStyle: "indented",
        });

        expect(indented).toBe("    const a = 1;");
        expect(indented).not.toContain("ts");
    });

    test("honours the heading, bullet, emphasis, and link controls", () => {
        expect(toMarkdown("<h1>Title</h1>", { headingStyle: "setext" })).toBe("Title\n=====");
        expect(toMarkdown("<ul><li>one</li></ul>", { bulletMarker: "asterisk" })).toContain(
            "*   one",
        );
        expect(toMarkdown("<p><em>i</em></p>", { emphasisStyle: "asterisk" })).toBe("*i*");
        expect(
            toMarkdown(`<p><a href="https://a.test">one</a></p>`, { linkStyle: "referenced" }),
        ).toBe("[one][1]\n\n[1]: https://a.test");
    });

    /** Setext has only two rules to draw, so h3 and below stay ATX whatever is asked. */
    test("falls back to ATX below the second heading level under setext", () => {
        expect(toMarkdown("<h3>deep</h3>", { headingStyle: "setext" })).toBe("### deep");
    });

    test("writes GFM tables, strikethrough, and task lists when GFM is on", () => {
        expect(
            toMarkdown(
                "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
            ),
        ).toBe("| A   |\n| --- |\n| 1   |");
        expect(toMarkdown("<p><del>gone</del></p>")).toBe("~~gone~~");
        expect(
            toMarkdown(
                `<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" checked disabled> done</li></ul>`,
            ),
        ).toContain("[x]");
    });

    test("flattens a table to its cell text when GFM is off", () => {
        const flattened = toMarkdown(
            "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
            { gfm: false },
        );

        expect(flattened).not.toContain("|");
        expect(flattened).toContain("A");
        expect(flattened).toContain("1");
    });

    test("keeps elements Markdown cannot say, and reports nothing for them", () => {
        expect(toMarkdown("<p>H<sub>2</sub>O</p>")).toBe("H<sub>2</sub>O");
        expect(toMarkdown("<p>Press <kbd>Ctrl</kbd></p>")).toBe("Press <kbd>Ctrl</kbd>");
    });

    test("unwraps them to their text when the reader turns that off", () => {
        expect(toMarkdown("<p>H<sub>2</sub>O</p>", { keepUnsupportedHtml: false })).toBe("H2O");
    });

    /**
     * The divergence from Turndown that mattered most: its default rule unwraps
     * an element it has no rule for, so a page carrying a script converts to a
     * paragraph of JavaScript. Both halves are asserted — that the debris is
     * gone, and that the reader is told it was thrown away.
     */
    test("drops script and style content instead of writing it out as prose", () => {
        const result = convert({
            mode: "htmlToMarkdown",
            text: "<p>before</p><script>alert(1)</script><style>p{color:red}</style><p>after</p>",
            options: options(),
        });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.output).toBe("before\n\nafter");
        expect(result.output).not.toContain("alert");
        expect(result.output).not.toContain("color:red");
        expect(result.removed).toEqual(["script", "style"]);
    });

    test("reports each dropped element once, however often it appears", () => {
        const result = convert({
            mode: "htmlToMarkdown",
            text: "<script>a()</script><script>b()</script><p>x</p>",
            options: options(),
        });

        expect(result.ok && result.removed).toEqual(["script"]);
    });

    test("says nothing about head metadata, which nobody expected to survive", () => {
        const result = convert({
            mode: "htmlToMarkdown",
            text: `<!doctype html><html><head><title>T</title><meta charset="utf-8"></head><body><h1>Hi</h1></body></html>`,
            options: options(),
        });

        expect(result.ok && result.output).toBe("# Hi");
        expect(result.ok && result.removed).toEqual([]);
    });

    test("decodes character references rather than carrying them through", () => {
        expect(toMarkdown("<p>5 &lt; 6 &amp;&amp; 7 &gt; 6</p>")).toBe("5 < 6 && 7 > 6");
    });

    test("converts an empty document to an empty result", () => {
        const result = convert({ mode: "htmlToMarkdown", text: "", options: options() });

        expect(result).toEqual({
            ok: true,
            output: "",
            inputBytes: 0,
            outputBytes: 0,
            removed: [],
        });
    });
});

describe("Markdown to HTML", () => {
    test("writes the blocks a document is made of", () => {
        expect(toHtml("# Title")).toBe("<h1>Title</h1>\n");
        expect(toHtml("- one\n- two")).toBe("<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n");
    });

    test("escapes what the author wrote, so a stray tag stays a stray tag", () => {
        expect(toHtml("5 < 6 & 7")).toBe("<p>5 &lt; 6 &amp; 7</p>\n");
    });

    test("reads tables and strikethrough only when GFM is on", () => {
        expect(toHtml("~~gone~~")).toBe("<p><del>gone</del></p>\n");
        expect(toHtml("~~gone~~", { gfm: false })).toBe("<p>~~gone~~</p>\n");
    });

    test("turns a single newline into a break only when asked", () => {
        expect(toHtml("one\ntwo")).toBe("<p>one\ntwo</p>\n");
        expect(toHtml("one\ntwo", { lineBreaks: true })).toBe("<p>one<br>two</p>\n");
    });

    test("wraps a standalone document and titles it from the first heading", () => {
        const document = toHtml("# My Notes\n\nBody.", { fullDocument: true });

        expect(document.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
        expect(document).toContain('<meta charset="utf-8">');
        expect(document).toContain("<title>My Notes</title>");
        expect(document).toContain("<h1>My Notes</h1>");
        expect(document.trimEnd().endsWith("</html>")).toBe(true);
    });

    test("escapes that title, since the author wrote it", () => {
        expect(toHtml(`# A <script> & "quotes"`, { fullDocument: true })).toContain(
            "<title>A &lt;script&gt; &amp; &quot;quotes&quot;</title>",
        );
    });

    /** A `#` inside a fence is code, not a heading — which is why the lexer decides. */
    test("does not take a title from inside a code block", () => {
        expect(toHtml("```\n# not a heading\n```\n\ntext", { fullDocument: true })).toContain(
            "<title>Document</title>",
        );
    });

    test("titles an untitled document rather than emitting an empty tag", () => {
        expect(toHtml("just a paragraph", { fullDocument: true })).toContain(
            "<title>Document</title>",
        );
    });
});

describe("round trip", () => {
    test("survives a document with every GFM construct in it", () => {
        const markdown = [
            "# Title",
            "",
            "Some **bold**, _italic_, and ~~struck~~ text.",
            "",
            "-   one",
            "-   two",
            "",
            "| A   | B   |",
            "| --- | --- |",
            "| 1   | 2   |",
            "",
            "```js",
            "const a = 1;",
            "```",
            "",
            "> quoted",
        ].join("\n");

        expect(toMarkdown(toHtml(markdown))).toBe(markdown);
    });
});

describe("limits", () => {
    test("refuses an input past the ceiling in either direction", () => {
        const oversized = "a".repeat(MAX_HTML_MARKDOWN_INPUT_BYTES + 1);

        expect(convert({ mode: "htmlToMarkdown", text: oversized, options: options() })).toEqual({
            ok: false,
            reason: "too_large",
        });
        expect(convert({ mode: "markdownToHtml", text: oversized, options: options() })).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("measures the ceiling in bytes, not characters", () => {
        // Three bytes each, so a third of the ceiling in characters is over it.
        const multibyte = "আ".repeat(MAX_HTML_MARKDOWN_INPUT_BYTES);

        expect(exceedsInputLimit(MAX_HTML_MARKDOWN_INPUT_BYTES)).toBe(false);
        expect(exceedsInputLimit(MAX_HTML_MARKDOWN_INPUT_BYTES + 1)).toBe(true);
        expect(convert({ mode: "htmlToMarkdown", text: multibyte, options: options() })).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("counts the bytes it converted, not the characters", () => {
        // Four Bangla characters, three bytes each, wrapped in eight ASCII
        // bytes of `<p>`, `</p>` and a newline.
        const result = convert({ mode: "markdownToHtml", text: "আকাশ", options: options() });

        expect(result.ok && result.output).toBe("<p>আকাশ</p>\n");
        expect(result.ok && result.inputBytes).toBe(12);
        expect(result.ok && result.outputBytes).toBe(20);
    });
});

describe("which options a direction reads", () => {
    test("shows GFM in both, since it changes what each one understands", () => {
        expect(appliesTo("gfm", "htmlToMarkdown")).toBe(true);
        expect(appliesTo("gfm", "markdownToHtml")).toBe(true);
    });

    test("keeps the Markdown-writing controls to the direction that writes Markdown", () => {
        for (const option of [
            "headingStyle",
            "bulletMarker",
            "codeBlockStyle",
            "emphasisStyle",
            "linkStyle",
            "keepUnsupportedHtml",
        ] as const) {
            expect(appliesTo(option, "htmlToMarkdown")).toBe(true);
            expect(appliesTo(option, "markdownToHtml")).toBe(false);
        }
    });

    test("keeps the HTML-writing controls to the direction that writes HTML", () => {
        for (const option of ["lineBreaks", "fullDocument"] as const) {
            expect(appliesTo(option, "markdownToHtml")).toBe(true);
            expect(appliesTo(option, "htmlToMarkdown")).toBe(false);
        }
    });

    test("ties the language hint to the fence, which is the only thing that can hold one", () => {
        expect(keepsCodeLanguage(options({ codeBlockStyle: "fenced" }))).toBe(true);
        expect(keepsCodeLanguage(options({ codeBlockStyle: "indented" }))).toBe(false);
    });
});
