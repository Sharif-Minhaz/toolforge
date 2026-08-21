import { describe, expect, test } from "bun:test";

import { MAX_SHARED_TEXT_LENGTH } from "@/modules/html-markdown/domain/constants";
import { htmlMarkdownSearchParamsSchema } from "@/modules/html-markdown/validation/conversion-options";

function parse(params: Record<string, unknown>) {
    const result = htmlMarkdownSearchParamsSchema.safeParse(params);

    if (!result.success) {
        throw new Error("the search-param schema must never reject; it degrades instead");
    }

    return result.data;
}

describe("shared links", () => {
    test("carries every option a link is allowed to name", () => {
        expect(
            parse({
                mode: "markdownToHtml",
                text: "# Hi",
                gfm: "false",
                headingStyle: "setext",
                bulletMarker: "plus",
                codeBlockStyle: "indented",
                linkStyle: "referenced",
            }),
        ).toEqual({
            mode: "markdownToHtml",
            text: "# Hi",
            gfm: false,
            headingStyle: "setext",
            bulletMarker: "plus",
            codeBlockStyle: "indented",
            linkStyle: "referenced",
        });
    });

    /**
     * Each field catches on its own, so one stale or hand-edited value opens the
     * page on a default rather than throwing the whole page away.
     */
    test("drops only the fields that are malformed, and keeps the rest", () => {
        expect(
            parse({
                mode: "sideways",
                headingStyle: "wavy",
                bulletMarker: "star",
                text: "keep me",
            }),
        ).toEqual({ text: "keep me" });
    });

    test("reads the boolean as the two spellings a URL can carry", () => {
        expect(parse({ gfm: "true" }).gfm).toBe(true);
        expect(parse({ gfm: "false" }).gfm).toBe(false);
        expect(parse({ gfm: "1" }).gfm).toBeUndefined();
        expect(parse({ gfm: true }).gfm).toBeUndefined();
    });

    test("refuses a shared document longer than a link should carry", () => {
        expect(parse({ text: "a".repeat(MAX_SHARED_TEXT_LENGTH) }).text).toHaveLength(
            MAX_SHARED_TEXT_LENGTH,
        );
        expect(parse({ text: "a".repeat(MAX_SHARED_TEXT_LENGTH + 1) }).text).toBeUndefined();
    });

    test("leaves an empty query entirely to the defaults", () => {
        expect(parse({})).toEqual({});
    });
});
