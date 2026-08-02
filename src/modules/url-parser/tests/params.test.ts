import { describe, expect, test } from "bun:test";

import {
    applyParams,
    buildQueryString,
    editParam,
    removeParam,
} from "@/modules/url-parser/domain/params";
import { parseUrl } from "@/modules/url-parser/domain/parse";
import type { UrlQueryParam } from "@/modules/url-parser/types";

const PARAMS: readonly UrlQueryParam[] = [
    { key: "q", value: "url parser" },
    { key: "page", value: "2" },
];

describe("buildQueryString", () => {
    test("percent-encodes the way a form does, spaces included", () => {
        expect(buildQueryString(PARAMS)).toBe("q=url+parser&page=2");
    });

    test("keeps a pair that has only one half", () => {
        // `k=` and `=v` are both real query strings, and both come back out of
        // the parser as the pair that went in.
        expect(buildQueryString([{ key: "k", value: "" }])).toBe("k=");
        expect(buildQueryString([{ key: "", value: "v" }])).toBe("=v");
    });

    test("drops the blank row the table renders for adding a parameter", () => {
        expect(buildQueryString([...PARAMS, { key: "", value: "" }])).toBe("q=url+parser&page=2");
        expect(buildQueryString([])).toBe("");
    });

    test("keeps repeated keys rather than collapsing them", () => {
        expect(
            buildQueryString([
                { key: "tag", value: "a" },
                { key: "tag", value: "b" },
            ]),
        ).toBe("tag=a&tag=b");
    });

    test("escapes a literal plus so it does not read back as a space", () => {
        expect(buildQueryString([{ key: "sum", value: "1+1" }])).toBe("sum=1%2B1");

        const roundTrip = parseUrl("https://example.com/?sum=1%2B1");

        expect(roundTrip.ok && roundTrip.params).toEqual([{ key: "sum", value: "1+1" }]);
    });
});

describe("editParam", () => {
    test("replaces one half of a row and leaves its neighbours alone", () => {
        expect(editParam(PARAMS, 1, { value: "3" })).toEqual([
            { key: "q", value: "url parser" },
            { key: "page", value: "3" },
        ]);
    });

    test("appends when the edit lands on the blank row past the end", () => {
        expect(editParam(PARAMS, PARAMS.length, { key: "sort" })).toEqual([
            ...PARAMS,
            { key: "sort", value: "" },
        ]);
    });

    test("ignores an index the table could never produce", () => {
        expect(editParam(PARAMS, -1, { key: "x" })).toEqual(PARAMS);
        expect(editParam(PARAMS, 9, { key: "x" })).toEqual(PARAMS);
    });
});

describe("removeParam", () => {
    test("drops the row at the index and nothing else", () => {
        expect(removeParam(PARAMS, 0)).toEqual([{ key: "page", value: "2" }]);
        expect(removeParam(PARAMS, 5)).toEqual(PARAMS);
    });
});

describe("applyParams", () => {
    test("rewrites the query and leaves every other part where it was", () => {
        const href = "https://team:secret@api.example.com:8443/v2/search?q=old#results";

        expect(applyParams(href, [{ key: "q", value: "new" }])).toBe(
            "https://team:secret@api.example.com:8443/v2/search?q=new#results",
        );
    });

    test("removes the question mark entirely once the last parameter goes", () => {
        expect(applyParams("https://example.com/a?x=1#top", [])).toBe("https://example.com/a#top");
    });

    test("survives a full round trip through the parser", () => {
        const parsed = parseUrl("https://example.com/?cat=meow");

        expect(parsed.ok).toBe(true);

        if (!parsed.ok) {
            return;
        }

        const next = applyParams(parsed.href, editParam(parsed.params, 1, { key: "dog" }));
        const reparsed = parseUrl(next);

        expect(next).toBe("https://example.com/?cat=meow&dog=");
        expect(reparsed.ok && reparsed.params).toEqual([
            { key: "cat", value: "meow" },
            { key: "dog", value: "" },
        ]);
    });

    test("hands back an unparseable href untouched", () => {
        expect(applyParams("not a url", PARAMS)).toBe("not a url");
    });
});
