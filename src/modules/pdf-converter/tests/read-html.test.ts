import { describe, expect, test } from "bun:test";

import { runsToText } from "@/modules/pdf-converter/domain/blocks";
import { readHtml } from "@/modules/pdf-converter/domain/read-html";
import type { DocBlock } from "@/modules/pdf-converter/types";

function read(html: string, includeImages = true): readonly DocBlock[] {
    return readHtml(html, { includeImages }).blocks;
}

const PNG_URI =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("headings and paragraphs", () => {
    test("keeps heading levels", () => {
        expect(read("<h1>One</h1><h3>Three</h3>")).toEqual([
            { kind: "heading", level: 1, runs: [{ text: "One" }] },
            { kind: "heading", level: 3, runs: [{ text: "Three" }] },
        ]);
    });

    test("collapses runs of whitespace the way a browser does", () => {
        const blocks = read("<p>a   b\n\tc</p>");

        expect(runsToText((blocks[0] as Extract<DocBlock, { kind: "paragraph" }>).runs)).toBe(
            "a b c",
        );
    });

    test("keeps loose text between blocks as its own paragraph", () => {
        // Plenty of real HTML never wraps its prose in a `<p>` at all.
        expect(read("<div>bare text<hr>after</div>")).toEqual([
            { kind: "paragraph", runs: [{ text: "bare text" }] },
            { kind: "rule" },
            { kind: "paragraph", runs: [{ text: "after" }] },
        ]);
    });

    test("walks through containers instead of drawing them", () => {
        expect(read("<section><article><p>deep</p></article></section>")).toEqual([
            { kind: "paragraph", runs: [{ text: "deep" }] },
        ]);
    });
});

describe("inline marks", () => {
    test("merges nested marks onto one run", () => {
        const blocks = read("<p><b>bold <i>and italic</i></b></p>");
        const runs = (blocks[0] as Extract<DocBlock, { kind: "paragraph" }>).runs;

        expect(runs).toEqual([
            { text: "bold ", bold: true },
            { text: "and italic", bold: true, italic: true },
        ]);
    });

    test("keeps a usable link and drops one that goes nowhere", () => {
        const withLink = read('<p><a href="https://example.com">go</a></p>');
        const withAnchor = read('<p><a href="#section">go</a></p>');
        const withScript = read('<p><a href="javascript:alert(1)">go</a></p>');

        expect((withLink[0] as Extract<DocBlock, { kind: "paragraph" }>).runs[0].link).toBe(
            "https://example.com",
        );
        expect((withAnchor[0] as Extract<DocBlock, { kind: "paragraph" }>).runs[0].link).toBe(
            undefined,
        );
        expect((withScript[0] as Extract<DocBlock, { kind: "paragraph" }>).runs[0].link).toBe(
            undefined,
        );
    });

    test("turns a break into a newline inside the same paragraph", () => {
        const blocks = read("<p>one<br>two</p>");

        expect(runsToText((blocks[0] as Extract<DocBlock, { kind: "paragraph" }>).runs)).toBe(
            "one\ntwo",
        );
    });
});

describe("what is thrown away", () => {
    test("a script does not become a paragraph of the document", () => {
        // The defect the HTML / Markdown converter's case study records: a
        // default rule that unwraps turns `alert(1)` into prose.
        expect(read("<p>before</p><script>alert(1)</script>")).toEqual([
            { kind: "paragraph", runs: [{ text: "before" }] },
        ]);
    });

    test("a stylesheet and head metadata go the same way", () => {
        expect(read("<style>p{color:red}</style><p>only this</p>")).toEqual([
            { kind: "paragraph", runs: [{ text: "only this" }] },
        ]);
    });
});

describe("code blocks", () => {
    test("keeps the whitespace, because the whitespace is the content", () => {
        const blocks = read("<pre><code>if (x) {\n    y();\n}\n</code></pre>");

        expect(blocks).toEqual([{ kind: "code", text: "if (x) {\n    y();\n}" }]);
    });
});

describe("lists", () => {
    test("flattens nesting to a level rather than a tree", () => {
        expect(read("<ul><li>one<ul><li>deep</li></ul></li><li>two</li></ul>")).toEqual([
            {
                kind: "list",
                ordered: false,
                items: [
                    { level: 0, runs: [{ text: "one" }] },
                    { level: 1, runs: [{ text: "deep" }] },
                    { level: 0, runs: [{ text: "two" }] },
                ],
            },
        ]);
    });

    test("an ordered list keeps its own flag", () => {
        const blocks = read("<ol><li>first</li></ol>");

        expect((blocks[0] as Extract<DocBlock, { kind: "list" }>).ordered).toBe(true);
    });
});

describe("tables", () => {
    test("takes a leading all-th row as the header even without thead", () => {
        const blocks = read(
            "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
        );
        const table = blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(table.head?.map((cell) => runsToText(cell.runs))).toEqual(["A", "B"]);
        expect(table.rows[0].map((cell) => runsToText(cell.runs))).toEqual(["1", "2"]);
    });

    test("carries spans through", () => {
        const blocks = read('<table><tr><td colspan="2">wide</td></tr></table>');
        const table = blocks[0] as Extract<DocBlock, { kind: "table" }>;

        expect(table.rows[0][0].colSpan).toBe(2);
    });

    test("keeps a caption beside the table rather than in it", () => {
        const blocks = read("<table><caption>Totals</caption><tr><td>1</td></tr></table>");

        expect((blocks[0] as Extract<DocBlock, { kind: "table" }>).caption).toBe("Totals");
    });
});

describe("images", () => {
    test("embeds a PNG data URI", () => {
        const blocks = read(`<img src="${PNG_URI}" alt="dot">`);

        expect(blocks).toEqual([
            {
                kind: "image",
                image: { dataUri: PNG_URI, widthPx: null, heightPx: null, alt: "dot" },
            },
        ]);
    });

    test("refuses to fetch a remote picture, and says so", () => {
        const result = readHtml('<img src="https://example.com/a.png">', { includeImages: true });

        expect(result.blocks).toEqual([]);
        expect(result.droppedImageTypes).toEqual(["remote"]);
    });

    test("names the media type PDF cannot store", () => {
        const result = readHtml('<img src="data:image/gif;base64,R0lGODlh">', {
            includeImages: true,
        });

        expect(result.droppedImageTypes).toEqual(["image/gif"]);
    });

    test("images off drops them without a notice — nothing was refused", () => {
        const result = readHtml(`<img src="${PNG_URI}">`, { includeImages: false });

        expect(result.blocks).toEqual([]);
        expect(result.droppedImageTypes).toEqual([]);
    });
});
