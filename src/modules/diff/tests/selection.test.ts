import { describe, expect, test } from "bun:test";

import { toSelectionText } from "@/modules/diff/domain/selection";

describe("toSelectionText", () => {
    test("keeps one line per row", () => {
        expect(toSelectionText([["alpha"], ["beta"]])).toBe("alpha\nbeta");
    });

    test("drops the side that has no line", () => {
        // What the split view hands over for a run of removals: the right cell
        // held only the screen-reader stand-in, which the viewer already removed.
        expect(
            toSelectionText([
                ["MCP_IP_SALT=one", ""],
                ["MCP_ACCESS_TOKEN=two", ""],
            ]),
        ).toBe("MCP_IP_SALT=one\nMCP_ACCESS_TOKEN=two");
    });

    test("keeps an addition that has no left side flush", () => {
        expect(toSelectionText([["", "added"]])).toBe("added");
    });

    test("collapses an unchanged split row shown in both columns", () => {
        expect(toSelectionText([["context", "context"]])).toBe("context");
    });

    test("separates the two sides of a changed row with a tab", () => {
        expect(toSelectionText([["before", "after"]])).toBe("before\tafter");
    });

    test("keeps a blank line as a blank line", () => {
        expect(
            toSelectionText([
                ["alpha", "alpha"],
                ["", ""],
                ["beta", "beta"],
            ]),
        ).toBe("alpha\n\nbeta");
    });

    test("preserves the indentation inside a line", () => {
        expect(toSelectionText([["    indented", "    indented"]])).toBe("    indented");
    });

    test("keeps two sides that differ only in case", () => {
        // `ignoreCase` calls these equal, but they are not the same text and the
        // reader can see both.
        expect(toSelectionText([["Alpha", "alpha"]])).toBe("Alpha\talpha");
    });

    test("is empty for a selection that covered nothing", () => {
        expect(toSelectionText([])).toBe("");
    });
});
