import { describe, expect, test } from "bun:test";

import { runsToText } from "@/modules/pdf-converter/domain/blocks";
import { readText } from "@/modules/pdf-converter/domain/read-text";
import type { DocBlock } from "@/modules/pdf-converter/types";

function paragraphs(source: string): readonly string[] {
    return readText(source).blocks.map((block) =>
        runsToText((block as Extract<DocBlock, { kind: "paragraph" }>).runs),
    );
}

describe("plain text is not parsed", () => {
    /*
     * The whole reason `text` is its own format rather than Markdown with the
     * extensions off. There is no "off" that stops Marked reading a leading `#`
     * as a heading, and a shopping list written with asterisks would come back
     * as a bulleted list nobody typed.
     */
    test("a leading hash is a hash, not a heading", () => {
        expect(readText("# Not a heading").blocks).toEqual([
            { kind: "paragraph", runs: [{ text: "# Not a heading", preserveSpaces: true }] },
        ]);
    });

    test("asterisks and underscores are punctuation, not emphasis", () => {
        expect(paragraphs("* milk\n* _eggs_ **twice**")).toEqual(["* milk\n* _eggs_ **twice**"]);
    });

    test("angle brackets are angle brackets", () => {
        expect(paragraphs("<b>literal</b> & co")).toEqual(["<b>literal</b> & co"]);
    });
});

describe("what the layout of a .txt means", () => {
    test("a blank line starts a new paragraph", () => {
        expect(paragraphs("First para.\n\nSecond para.")).toEqual(["First para.", "Second para."]);
    });

    test("runs of blank lines are one break, not several empty paragraphs", () => {
        expect(paragraphs("One\n\n\n\nTwo")).toEqual(["One", "Two"]);
    });

    test("line breaks inside a paragraph survive", () => {
        // Hard-wrapped lines are the only layout a file with no markup has —
        // an address block, a signature, a poem.
        expect(paragraphs("Jane Smith\n12 Example Road\nDhaka")).toEqual([
            "Jane Smith\n12 Example Road\nDhaka",
        ]);
    });

    test("leading indentation is kept and marked significant", () => {
        const [block] = readText("Outline\n    indented\n        deeper").blocks;
        const runs = (block as Extract<DocBlock, { kind: "paragraph" }>).runs;

        expect(runsToText(runs)).toBe("Outline\n    indented\n        deeper");
        expect(runs[0].preserveSpaces).toBe(true);
    });

    test("trailing whitespace goes, because nothing reads it", () => {
        expect(paragraphs("padded   \nlines\t")).toEqual(["padded\nlines"]);
    });

    test("Windows and classic Mac line endings read the same as Unix ones", () => {
        expect(paragraphs("a\r\nb\r\n\r\nc")).toEqual(["a\nb", "c"]);
        expect(paragraphs("a\rb\r\rc")).toEqual(["a\nb", "c"]);
    });

    test("a file of only whitespace has no blocks at all", () => {
        expect(readText("   \n\n \t \n").blocks).toEqual([]);
    });
});

describe("the title a .txt can be named after", () => {
    test("a short first line standing alone is the title", () => {
        expect(readText("Release notes\n\nWe shipped a thing.").title).toBe("Release notes");
    });

    test("a first line with prose directly under it is a paragraph opening", () => {
        expect(readText("We shipped a thing today\nand another tomorrow.").title).toBe(null);
    });

    test("a long first line is a sentence rather than a title", () => {
        const long = `${"word ".repeat(30).trim()}`;

        expect(readText(`${long}\n\nBody.`).title).toBe(null);
    });

    test("a one-line file is its own title", () => {
        expect(readText("Shopping list").title).toBe("Shopping list");
    });

    test("an empty file has no title", () => {
        expect(readText("").title).toBe(null);
    });
});
