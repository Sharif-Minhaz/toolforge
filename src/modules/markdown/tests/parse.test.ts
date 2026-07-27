import { describe, expect, test } from "bun:test";

import { MAX_MARKDOWN_LENGTH } from "@/modules/markdown/domain/constants";
import { parseMarkdown, plainText } from "@/modules/markdown/domain/parse";
import type { MarkdownBlock, MarkdownDocument } from "@/modules/markdown/types";

function parse(source: string): MarkdownDocument {
    const result = parseMarkdown(source);

    if (!result.ok) {
        throw new Error(`expected a parse, got ${result.reason}`);
    }

    return result.document;
}

function blocks(source: string): readonly MarkdownBlock[] {
    return parse(source).blocks;
}

function firstBlock(source: string): MarkdownBlock {
    const [block] = blocks(source);

    if (block === undefined) {
        throw new Error("expected at least one block");
    }

    return block;
}

describe("parseMarkdown — limits", () => {
    test("parses an empty document into no blocks", () => {
        expect(blocks("")).toEqual([]);
    });

    test("accepts a document exactly at the ceiling", () => {
        expect(parseMarkdown("a".repeat(MAX_MARKDOWN_LENGTH)).ok).toBe(true);
    });

    test("refuses one character past the ceiling", () => {
        expect(parseMarkdown("a".repeat(MAX_MARKDOWN_LENGTH + 1))).toEqual({
            ok: false,
            reason: "too_large",
        });
    });
});

describe("parseMarkdown — blocks", () => {
    test("reads a heading with its depth and anchor", () => {
        expect(firstBlock("## Getting started")).toEqual({
            kind: "heading",
            depth: 2,
            id: "getting-started",
            children: [{ kind: "text", value: "Getting started" }],
        });
    });

    test("numbers repeated headings so anchors stay unique", () => {
        const ids = parse("# Usage\n\n# Usage\n\n# Usage").outline.map((entry) => entry.id);

        expect(ids).toEqual(["usage", "usage-1", "usage-2"]);
    });

    test("keeps a Bangla heading's anchor rather than emptying it", () => {
        expect(parse("## শুরু করা").outline[0].id).toBe("শুরু-করা");
    });

    test("collects an outline with depth and title", () => {
        expect(parse("# A\n\n### B").outline).toEqual([
            { id: "a", depth: 1, title: "A" },
            { id: "b", depth: 3, title: "B" },
        ]);
    });

    test("reads a fenced block and its language", () => {
        expect(firstBlock("```ts\nconst a = 1;\n```")).toEqual({
            kind: "code",
            language: "ts",
            value: "const a = 1;",
        });
    });

    test("takes only the language from a fence infostring", () => {
        const block = firstBlock("```ts title=example.ts\nconst a = 1;\n```");

        expect(block).toMatchObject({ kind: "code", language: "ts" });
    });

    test("leaves an unlabelled fence without a language", () => {
        expect(firstBlock("```\nplain\n```")).toEqual({
            kind: "code",
            language: null,
            value: "plain",
        });
    });

    test("turns a mermaid fence into a diagram rather than source", () => {
        expect(firstBlock("```mermaid\nflowchart LR\n  A --> B\n```")).toEqual({
            kind: "diagram",
            source: "flowchart LR\n  A --> B",
        });
    });

    test("reads a horizontal rule", () => {
        expect(firstBlock("---\n")).toEqual({ kind: "rule" });
    });

    test("reads a table with its alignment", () => {
        expect(firstBlock("| a | b |\n| :-- | --: |\n| 1 | 2 |")).toEqual({
            kind: "table",
            header: [
                { align: "left", children: [{ kind: "text", value: "a" }] },
                { align: "right", children: [{ kind: "text", value: "b" }] },
            ],
            rows: [
                [
                    { align: "left", children: [{ kind: "text", value: "1" }] },
                    { align: "right", children: [{ kind: "text", value: "2" }] },
                ],
            ],
        });
    });
});

describe("parseMarkdown — lists", () => {
    test("reads a tight bullet list", () => {
        const block = firstBlock("- one\n- two");

        expect(block).toMatchObject({ kind: "list", ordered: false, tight: true, start: 1 });
    });

    test("keeps an ordered list's starting number", () => {
        expect(firstBlock("3. three\n4. four")).toMatchObject({
            kind: "list",
            ordered: true,
            start: 3,
        });
    });

    test("marks a loose list, where items carry their own spacing", () => {
        expect(firstBlock("- one\n\n- two")).toMatchObject({ tight: false });
    });

    test("reads task items as checked and unchecked", () => {
        const block = firstBlock("- [x] done\n- [ ] todo\n- plain");

        if (block.kind !== "list") {
            throw new Error("expected a list");
        }

        expect(block.items.map((item) => item.checked)).toEqual([true, false, null]);
    });

    test("drops the checkbox marker from the item's own content", () => {
        const block = firstBlock("- [x] done");

        if (block.kind !== "list") {
            throw new Error("expected a list");
        }

        expect(block.items[0].children).toEqual([
            { kind: "paragraph", children: [{ kind: "text", value: "done" }] },
        ]);
    });

    test("nests a sub-list inside its parent item", () => {
        const block = firstBlock("- one\n    - nested");

        if (block.kind !== "list") {
            throw new Error("expected a list");
        }

        expect(block.items[0].children.some((child) => child.kind === "list")).toBe(true);
    });
});

describe("parseMarkdown — blockquotes and alerts", () => {
    test("reads a plain blockquote with no alert", () => {
        expect(firstBlock("> quoted")).toEqual({
            kind: "blockquote",
            alert: null,
            children: [{ kind: "paragraph", children: [{ kind: "text", value: "quoted" }] }],
        });
    });

    test("lifts a GitHub alert marker off the first line", () => {
        expect(firstBlock("> [!WARNING]\n> Mind the gap")).toEqual({
            kind: "blockquote",
            alert: "warning",
            children: [{ kind: "paragraph", children: [{ kind: "text", value: "Mind the gap" }] }],
        });
    });

    test("supports every alert flavour", () => {
        for (const [marker, alert] of [
            ["NOTE", "note"],
            ["TIP", "tip"],
            ["IMPORTANT", "important"],
            ["WARNING", "warning"],
            ["CAUTION", "caution"],
        ] as const) {
            expect(firstBlock(`> [!${marker}]\n> body`)).toMatchObject({ alert });
        }
    });

    test("ignores a marker that is not one of the five", () => {
        expect(firstBlock("> [!SHOUT]\n> body")).toMatchObject({ alert: null });
    });

    test("keeps an alert with its body in a separate paragraph", () => {
        const block = firstBlock("> [!TIP]\n>\n> Second paragraph");

        expect(block).toMatchObject({ kind: "blockquote", alert: "tip" });
    });
});

describe("parseMarkdown — inline", () => {
    test("reads bold, italic, strikethrough and code", () => {
        const block = firstBlock("**b** _i_ ~~s~~ `c`");

        if (block.kind !== "paragraph") {
            throw new Error("expected a paragraph");
        }

        expect(block.children.map((child) => child.kind)).toEqual([
            "strong",
            "text",
            "emphasis",
            "text",
            "strikethrough",
            "text",
            "code",
        ]);
    });

    test("keeps an escaped marker as the literal character", () => {
        expect(firstBlock("\\*not emphasis\\*")).toEqual({
            kind: "paragraph",
            children: [
                { kind: "text", value: "*" },
                { kind: "text", value: "not emphasis" },
                { kind: "text", value: "*" },
            ],
        });
    });

    test("resolves character references into the characters they name", () => {
        expect(firstBlock("A &amp; B &mdash; C &#8230; &#x263A;")).toEqual({
            kind: "paragraph",
            children: [{ kind: "text", value: "A & B — C … ☺" }],
        });
    });

    test("leaves an unknown reference exactly as typed", () => {
        expect(firstBlock("&notareference;")).toMatchObject({
            children: [{ kind: "text", value: "&notareference;" }],
        });
    });

    test("reads a link with its title", () => {
        expect(firstBlock('[docs](https://example.com "Title")')).toEqual({
            kind: "paragraph",
            children: [
                {
                    kind: "link",
                    href: "https://example.com",
                    title: "Title",
                    children: [{ kind: "text", value: "docs" }],
                },
            ],
        });
    });

    test("reads an image with its alt text", () => {
        expect(firstBlock("![a picture](/logo.svg)")).toEqual({
            kind: "paragraph",
            children: [{ kind: "image", src: "/logo.svg", title: null, alt: "a picture" }],
        });
    });
});

describe("parseMarkdown — untrusted input", () => {
    test("carries a raw HTML block as literal text, never as markup", () => {
        expect(firstBlock('<img src=x onerror="alert(1)">')).toEqual({
            kind: "rawHtml",
            value: '<img src=x onerror="alert(1)">',
        });
    });

    test("carries inline HTML as text inside its paragraph", () => {
        expect(firstBlock("before <b>bold</b> after")).toMatchObject({
            kind: "paragraph",
            children: [
                { kind: "text", value: "before " },
                { kind: "text", value: "<b>" },
                { kind: "text", value: "bold" },
                { kind: "text", value: "</b>" },
                { kind: "text", value: " after" },
            ],
        });
    });

    test("demotes a javascript: link to its own label", () => {
        expect(firstBlock("[click](javascript:alert(1))")).toEqual({
            kind: "paragraph",
            children: [{ kind: "text", value: "click" }],
        });
    });

    test("demotes an svg data: image to its alt text", () => {
        expect(firstBlock("![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)")).toEqual({
            kind: "paragraph",
            children: [{ kind: "text", value: "x" }],
        });
    });
});

describe("parseMarkdown — math", () => {
    test("reads inline math without letting emphasis rules touch it", () => {
        expect(firstBlock("Let $x_1 + x_2 = y$ hold.")).toEqual({
            kind: "paragraph",
            children: [
                { kind: "text", value: "Let " },
                { kind: "math", tex: "x_1 + x_2 = y", display: false },
                { kind: "text", value: " hold." },
            ],
        });
    });

    test("keeps braces and backslashes inside a formula", () => {
        expect(firstBlock("$$\\frac{a}{b}$$")).toEqual({
            kind: "mathBlock",
            tex: "\\frac{a}{b}",
        });
    });

    test("lifts every display equation in a paragraph to its own block", () => {
        expect(blocks("$$a$$\n$$b$$")).toEqual([
            { kind: "mathBlock", tex: "a" },
            { kind: "mathBlock", tex: "b" },
        ]);
    });

    test("leaves display math inline when prose shares the paragraph", () => {
        const block = firstBlock("see $$a$$ here");

        expect(block).toMatchObject({ kind: "paragraph" });
    });

    test("leaves currency alone", () => {
        expect(firstBlock("It costs $5 and $10.")).toEqual({
            kind: "paragraph",
            children: [{ kind: "text", value: "It costs $5 and $10." }],
        });
    });

    test("does not open a formula on a space", () => {
        expect(firstBlock("a $ b $ c")).toMatchObject({
            children: [{ kind: "text", value: "a $ b $ c" }],
        });
    });

    test("reports whether the document needs the maths stylesheet", () => {
        expect(parse("plain").hasMath).toBe(false);
        expect(parse("$x$").hasMath).toBe(true);
        expect(parse("$$x$$").hasMath).toBe(true);
        expect(parse("| $x$ |\n| --- |\n| a |").hasMath).toBe(true);
    });

    test("reports whether the document needs the diagram renderer", () => {
        expect(parse("plain").hasDiagrams).toBe(false);
        expect(parse("```mermaid\ngraph TD\n```").hasDiagrams).toBe(true);
        expect(parse("- item\n\n  ```mermaid\n  graph TD\n  ```").hasDiagrams).toBe(true);
    });
});

describe("plainText", () => {
    test("flattens nested inline runs to their words", () => {
        expect(
            plainText([
                { kind: "text", value: "a " },
                {
                    kind: "strong",
                    children: [{ kind: "emphasis", children: [{ kind: "text", value: "b" }] }],
                },
                { kind: "break" },
                { kind: "code", value: "c" },
                { kind: "image", src: "/x.png", title: null, alt: "d" },
                { kind: "math", tex: "e", display: false },
            ]),
        ).toBe("a b cde");
    });
});
