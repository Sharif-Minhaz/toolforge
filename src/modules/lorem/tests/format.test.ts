import { describe, expect, test } from "bun:test";

import { escapeHtml, joinBlocks, renderBlocks } from "@/modules/lorem/domain/format";

describe("escapeHtml", () => {
    test("neutralises every character that could open a tag or attribute", () => {
        expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
        );
    });

    test("leaves ordinary prose and emoji untouched", () => {
        expect(escapeHtml("Lorem ipsum dolor sit amet.")).toBe("Lorem ipsum dolor sit amet.");
        expect(escapeHtml("🚀 আকাশ")).toBe("🚀 আকাশ");
    });

    test("escapes an ampersand once, not twice", () => {
        expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    });
});

describe("renderBlocks", () => {
    test("passes plain paragraphs through unchanged", () => {
        expect(renderBlocks(["one", "two"], "plain")).toEqual(["one", "two"]);
    });

    test("wraps each paragraph in a p element and escapes it", () => {
        expect(renderBlocks(["a < b"], "html")).toEqual(["<p>a &lt; b</p>"]);
    });

    test("handles the empty case", () => {
        expect(renderBlocks([], "plain")).toEqual([]);
        expect(renderBlocks([], "html")).toEqual([]);
    });
});

describe("joinBlocks", () => {
    test("separates plain paragraphs with a blank line", () => {
        expect(joinBlocks(["one", "two"], "plain")).toBe("one\n\ntwo");
    });

    test("separates html blocks with a single newline", () => {
        expect(joinBlocks(["<p>one</p>", "<p>two</p>"], "html")).toBe("<p>one</p>\n<p>two</p>");
    });

    test("returns an empty string for no blocks", () => {
        expect(joinBlocks([], "plain")).toBe("");
        expect(joinBlocks([], "html")).toBe("");
    });
});
