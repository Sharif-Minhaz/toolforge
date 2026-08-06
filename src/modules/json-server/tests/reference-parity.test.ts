import { describe, expect, test } from "bun:test";

import { documentBytes } from "@/modules/json-server/domain/document";
import { serve } from "@/modules/json-server/domain/serve";
import type { HttpMethod, JsonDocument, JsonValue } from "@/modules/json-server/types";

/**
 * The behaviours that only came out of running this engine against the real
 * `json-server`, pinned so they cannot drift back.
 *
 * The cross-check itself is a throwaway script — it needs the npm package and
 * therefore does not belong in the repository, exactly like the ICO writer's
 * `identify`/Pillow run and the QR encoder's `jsqr` round trip. What belongs
 * here is the *result*: every one of these assertions was wrong in the first
 * implementation, every one passed the hand-written tests anyway, and every one
 * would have made a fixture behave differently once it was hosted.
 *
 * How the comparison was run, if it needs repeating: `npm i json-server@1` in a
 * scratch directory, import its `Service`, `parseWhere` and the query-string
 * mapping out of `lib/app.js`, and drive both engines over the same document.
 * No server is booted and nothing is added to this project's dependencies.
 */

const DB: JsonDocument = {
    posts: [
        { id: "1", title: "a title", views: 100, author: { name: "typicode" }, draft: false },
        { id: "2", title: "another title", views: 200, author: { name: "alice" }, draft: true },
        { id: "3", title: "Third POST", views: 50, author: { name: "mallory" }, draft: false },
        { id: "10", title: "Tenth", views: 5, author: { name: "bob" }, draft: false },
    ],
    comments: [
        { id: "1", text: "about post 1", postId: "1" },
        { id: "2", text: "orphan", postId: null },
    ],
};

function get(path: string, queryString = ""): JsonValue {
    const outcome = serve(
        {
            method: "GET" as HttpMethod,
            path,
            query: [...new URLSearchParams(queryString).entries()],
            body: "",
        },
        DB,
        documentBytes(DB),
    );

    return outcome.status === 200
        ? (JSON.parse(outcome.body) as JsonValue)
        : { status: outcome.status };
}

function ids(value: JsonValue): string[] {
    return (value as { id: string }[]).map((row) => row.id);
}

describe("sorting matches sort-on", () => {
    /**
     * `sort-on` compares strings with `localeCompare`. A code-unit comparison
     * puts every capital first, so `Tenth` and `Third POST` would lead — which
     * is what this engine did until the two were run side by side.
     */
    test("strings sort by collation, not by code unit", () => {
        expect(ids(get("/posts", "_sort=title"))).toEqual(["1", "2", "10", "3"]);
    });

    /**
     * And a falsy value sorts **last** ascending, except `0`. It reads
     * backwards; it is the reference's rule, so `?_sort=draft` leads with the
     * drafts.
     */
    test("false sorts after true", () => {
        expect(ids(get("/posts", "_sort=draft,-views"))).toEqual(["2", "1", "3", "10"]);
    });

    test("descending flips both rules together", () => {
        expect(ids(get("/posts", "_sort=-title"))).toEqual(["3", "10", "2", "1"]);
    });
});

describe("pagination gating matches lib/app.js", () => {
    /** `_per_page` alone is not pagination — the envelope needs `_page`. */
    test("_per_page without _page returns a plain array", () => {
        expect(Array.isArray(get("/posts", "_per_page=3"))).toBe(true);
    });

    /** `_per_page=0` clamps to **one**, not to the default of ten. */
    test("_per_page of zero is one record a page", () => {
        expect(get("/posts", "_page=1&_per_page=0")).toMatchObject({ pages: 4, next: 2 });
    });

    /** `parseInt`, so `?_page=2x` is page two and `?_page=x` is not paginated. */
    test("a page that cannot be read at all is not pagination", () => {
        expect(Array.isArray(get("/posts", "_page=x"))).toBe(true);
    });

    test("a page with a numeric prefix is read", () => {
        expect(get("/posts", "_page=2x&_per_page=2")).toMatchObject({ prev: 1, next: null });
    });
});

describe("embed matches the reference", () => {
    /**
     * The direction is decided by the target's own plurality, and the parent
     * lookup **pluralises**. A first version read `document["post"]`, which no
     * document has, so `_embed=post` silently returned nothing on every fixture.
     */
    test("a singular target reads the pluralised collection", () => {
        const [comment] = get("/comments", "_embed=post") as { post?: unknown }[];

        expect(comment.post).toMatchObject({ id: "1" });
    });

    /** No parent means **no key**, not a null one. */
    test("an unmatched parent omits the key entirely", () => {
        const [, orphan] = get("/comments", "_embed=post") as Record<string, unknown>[];

        expect("post" in orphan).toBe(false);
    });

    test("a plural target reads children by the parent's foreign key", () => {
        const [post] = get("/posts", "_embed=comments") as { comments: unknown[] }[];

        expect(post.comments).toHaveLength(1);
    });

    /**
     * Embedding runs **before** filtering and sorting. Doing it last is cheaper
     * and silently drops every query that reaches an embedded field — which is
     * a whole class of query, not an edge case.
     *
     * Its own document, so the ordering under test is the embedded field and not
     * the "falsy sorts last" rule an orphan would trigger.
     */
    const RELATED: JsonDocument = {
        posts: [
            { id: "1", views: 10 },
            { id: "2", views: 90 },
        ],
        comments: [
            { id: "a", postId: "1" },
            { id: "b", postId: "2" },
        ],
    };

    function related(queryString: string): JsonValue {
        const outcome = serve(
            {
                method: "GET",
                path: "/comments",
                query: [...new URLSearchParams(queryString).entries()],
                body: "",
            },
            RELATED,
            documentBytes(RELATED),
        );

        return JSON.parse(outcome.body) as JsonValue;
    }

    test("a sort can reach an embedded field", () => {
        expect(ids(related("_embed=post&_sort=-post.views"))).toEqual(["b", "a"]);
        expect(ids(related("_embed=post&_sort=post.views"))).toEqual(["a", "b"]);
    });

    test("a filter can reach one too", () => {
        expect(ids(related("_embed=post&post.views:gt=50"))).toEqual(["b"]);
    });

    test("_embed works on a single record too", () => {
        expect(get("/posts/1", "_embed=comments")).toMatchObject({ id: "1" });
        expect(
            (get("/posts/1", "_embed=comments") as { comments: unknown[] }).comments,
        ).toHaveLength(1);
    });
});

describe("_where operands stay typed", () => {
    /**
     * `{"id": {"in": ["1","2"]}}` carries an array. Routing `_where` through the
     * string-based condition path stringified it and split it on commas, so the
     * query matched nothing at all.
     */
    test("in takes an array without being stringified", () => {
        expect(ids(get("/posts", `_where=${JSON.stringify({ id: { in: ["1", "2"] } })}`))).toEqual([
            "1",
            "2",
        ]);
    });

    test("a boolean operand is not coerced through text", () => {
        expect(ids(get("/posts", `_where=${JSON.stringify({ draft: { eq: false } })}`))).toEqual([
            "1",
            "3",
            "10",
        ]);
    });
});

describe("query coercion matches parse-where.js", () => {
    /** By the value's own literal shape, never against the field it meets. */
    test("a numeric query does not match a string field", () => {
        const withCode: JsonDocument = { rows: [{ id: "1", code: "007" }] };
        const outcome = serve(
            { method: "GET", path: "/rows", query: [["code", "007"]], body: "" },
            withCode,
            documentBytes(withCode),
        );

        expect(JSON.parse(outcome.body)).toEqual([]);
    });

    /** v0.17's operator spelling is still read, quirk included. */
    test("the underscore operator form still works", () => {
        expect(ids(get("/posts", "views_gt=60"))).toEqual(["1", "2"]);
    });

    test("a field whose name ends in a non-operator word is left alone", () => {
        const rows: JsonDocument = { rows: [{ id: "1", created_at: "x" }] };
        const outcome = serve(
            { method: "GET", path: "/rows", query: [["created_at", "x"]], body: "" },
            rows,
            documentBytes(rows),
        );

        expect(JSON.parse(outcome.body)).toHaveLength(1);
    });
});
