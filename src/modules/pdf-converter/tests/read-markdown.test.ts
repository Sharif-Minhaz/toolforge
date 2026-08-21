import { describe, expect, test } from "bun:test";

import { blocksText } from "@/modules/pdf-converter/domain/blocks";
import { readMarkdown, stripMdxSyntax } from "@/modules/pdf-converter/domain/read-markdown";
import type { DocBlock } from "@/modules/pdf-converter/types";

function read(source: string, mdx = false) {
    return readMarkdown(source, { includeImages: true, mdx });
}

describe("markdown", () => {
    test("headings, lists and tables arrive as blocks", () => {
        const { blocks } = read("# Title\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |\n");

        expect(blocks.map((block) => block.kind)).toEqual(["heading", "list", "table"]);
    });

    test("a fenced block keeps its indentation", () => {
        const { blocks } = read("```ts\nif (x) {\n    y();\n}\n```\n");

        expect(blocks).toEqual([{ kind: "code", text: "if (x) {\n    y();\n}" }]);
    });

    test("front matter is metadata, not the first paragraph", () => {
        const result = read('---\ntitle: "Release notes"\ndraft: true\n---\n\nBody text.\n');

        expect(result.title).toBe("Release notes");
        expect(blocksText(result.blocks)).toBe("Body text.");
    });

    test("a document with no front matter takes its title from the first heading", () => {
        expect(read("## Second level first\n\ntext\n").title).toBe(null);
    });
});

describe("mdx", () => {
    test("removes imports and exports, and names what it removed", () => {
        const { markdown, stripped } = stripMdxSyntax(
            'import Chart from "./chart";\n\nexport const meta = 1;\n\n# Heading\n',
        );

        expect(markdown.trim()).toBe("# Heading");
        expect([...stripped].sort()).toEqual(["export", "import"]);
    });

    test("removes a component but leaves plain HTML alone", () => {
        const { markdown, stripped } = stripMdxSyntax(
            "<Callout>gone</Callout>\n\n<div>kept</div>\n\n<Chart.Bar />\n",
        );

        expect(markdown).toContain("<div>kept</div>");
        expect(markdown).not.toContain("Callout");
        expect(markdown).not.toContain("Chart.Bar");
        expect(stripped).toEqual(["jsx"]);
    });

    test("leaves an import inside a fence alone", () => {
        // The case worth protecting: most MDX that reaches a converter is
        // documentation *about* imports.
        const { markdown, stripped } = stripMdxSyntax(
            '```ts\nimport { useState } from "react";\n```\n',
        );

        expect(markdown).toContain('import { useState } from "react";');
        expect(stripped).toEqual([]);
    });

    test("removes a brace expression on its own line", () => {
        const { stripped } = stripMdxSyntax("# Title\n\n{frontmatter.description}\n");

        expect(stripped).toEqual(["expression"]);
    });

    test("plain markdown is not stripped, even when it looks like MDX", () => {
        const result = read('import x from "y";\n', false);

        expect(result.strippedMdx).toEqual([]);
        expect(blocksText(result.blocks)).toContain("import");
    });

    test("reading as MDX reports the strip alongside the blocks", () => {
        const result = read('import x from "y";\n\n# Kept\n', true);

        expect(result.strippedMdx).toEqual(["import"]);
        expect(result.blocks).toEqual([
            { kind: "heading", level: 1, runs: [{ text: "Kept" }] } satisfies DocBlock,
        ]);
    });
});
