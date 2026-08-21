import { describe, expect, test } from "bun:test";

import { joinBlocks, renderBlocks } from "@/modules/lorem/domain/format";

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
