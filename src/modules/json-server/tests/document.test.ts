import { describe, expect, test } from "bun:test";

import {
    MAX_COLLECTIONS,
    MAX_DOCUMENT_DEPTH,
    MAX_ITEMS_PER_COLLECTION,
    MAX_UPLOAD_BYTES,
} from "@/modules/json-server/domain/constants";
import {
    checkDocument,
    isRoutableName,
    readDocument,
    resourceKind,
    summarize,
    writeDocument,
} from "@/modules/json-server/domain/document";
import type { JsonObject } from "@/modules/json-server/types";

/** The document from `json-server`'s own README, which is the shape to get right. */
const README_DB = `{
  "posts": [
    { "id": "1", "title": "a title", "views": 100 },
    { "id": "2", "title": "another title", "views": 200 }
  ],
  "comments": [
    { "id": "1", "text": "a comment about post 1", "postId": "1" },
    { "id": "2", "text": "another comment about post 1", "postId": "1" }
  ],
  "profile": { "name": "typicode" }
}`;

function ok(input: string) {
    const result = readDocument(input);

    if (!result.ok) {
        throw new Error(`expected a document, got ${result.reason}`);
    }

    return result;
}

describe("readDocument", () => {
    test("reads the README's db.json into three resources", () => {
        const result = ok(README_DB);

        expect(Object.keys(result.document)).toEqual(["posts", "comments", "profile"]);
        expect(result.generatedIds).toBe(0);
        expect(result.coercedIds).toBe(0);
    });

    test("classifies arrays of objects, lone objects and everything else", () => {
        const result = ok('{"posts":[{"id":"1"}],"profile":{"a":1},"tags":["x","y"],"count":3}');

        expect(result.resources.map((resource) => [resource.name, resource.kind])).toEqual([
            ["posts", "collection"],
            ["profile", "singular"],
            ["tags", "opaque"],
            ["count", "opaque"],
        ]);
    });

    /**
     * The way somebody starts a server they intend to POST into. Reading it as
     * opaque would leave them unable to add the first record.
     */
    test("an empty array is a collection, not an opaque value", () => {
        expect(resourceKind([])).toBe("collection");
        expect(ok('{"posts":[]}').resources[0].kind).toBe("collection");
    });

    describe("ids", () => {
        test("keeps a string id exactly", () => {
            const result = ok('{"posts":[{"id":"abc","t":1}]}');

            expect((result.document.posts as JsonObject[])[0].id).toBe("abc");
            expect(result.coercedIds).toBe(0);
        });

        /** A v0 fixture is all integers, and `GET /posts/1` has to find them. */
        test("coerces a numeric id to its string spelling and counts it", () => {
            const result = ok('{"posts":[{"id":1},{"id":2}]}');

            expect((result.document.posts as JsonObject[]).map((row) => row.id)).toEqual([
                "1",
                "2",
            ]);
            expect(result.coercedIds).toBe(2);
        });

        test("generates one for a record that arrived without", () => {
            const result = ok('{"posts":[{"title":"x"},{"title":"y"}]}');

            expect((result.document.posts as JsonObject[]).map((row) => row.id)).toEqual([
                "1",
                "2",
            ]);
            expect(result.generatedIds).toBe(2);
        });

        /** Counting up from 1 rather than from the length is what avoids this. */
        test("a generated id never collides with one already present", () => {
            const result = ok('{"posts":[{"id":"1"},{"title":"no id"}]}');

            expect((result.document.posts as JsonObject[]).map((row) => row.id)).toEqual([
                "1",
                "2",
            ]);
        });

        test("an empty-string id counts as absent", () => {
            const result = ok('{"posts":[{"id":"","t":1}]}');

            expect((result.document.posts as JsonObject[])[0].id).toBe("1");
            expect(result.generatedIds).toBe(1);
        });

        /**
         * Two records at one address is the state no later edit recovers from,
         * so it is refused at the door rather than renamed behind somebody's
         * back.
         */
        test("refuses a collection with a repeated id, naming the resource", () => {
            expect(readDocument('{"posts":[{"id":"1"},{"id":"1"}]}')).toEqual({
                ok: false,
                reason: "duplicate_id",
                resource: "posts",
            });
        });

        test("catches a repeat that only appears after coercion", () => {
            expect(readDocument('{"posts":[{"id":1},{"id":"1"}]}')).toEqual({
                ok: false,
                reason: "duplicate_id",
                resource: "posts",
            });
        });

        /** An opaque list is data, not a database — nothing is rewritten in it. */
        test("leaves a list of scalars completely alone", () => {
            const result = ok('{"tags":["b","a"],"posts":[{"t":1}]}');

            expect(result.document.tags).toEqual(["b", "a"]);
            expect(result.generatedIds).toBe(1);
        });

        test("does not invent an id for a singular resource", () => {
            const result = ok('{"profile":{"name":"typicode"}}');

            expect(result.document.profile).toEqual({ name: "typicode" });
            expect(result.generatedIds).toBe(0);
        });
    });

    describe("failures", () => {
        test("an empty box is empty, not invalid", () => {
            expect(readDocument("   \n ")).toEqual({ ok: false, reason: "empty" });
        });

        /**
         * The whole reason this uses the hand-written reader: a person is
         * looking at the text, and a failure with no coordinates is a hunt.
         */
        test("a syntax error carries the line and column", () => {
            const result = readDocument('{\n  "posts": [},\n}');

            expect(result.ok).toBe(false);

            if (result.ok) {
                return;
            }

            expect(result.reason).toBe("invalid_json");
            expect(result.line).toBe(2);
            expect(result.column).toBeGreaterThan(0);
        });

        test("a top-level array is not a db.json", () => {
            expect(readDocument("[1,2,3]")).toEqual({ ok: false, reason: "not_an_object" });
        });

        test("a top-level scalar is not one either", () => {
            expect(readDocument('"hello"')).toEqual({ ok: false, reason: "not_an_object" });
        });

        test("refuses more top-level keys than the ceiling allows", () => {
            const keys = Array.from(
                { length: MAX_COLLECTIONS + 1 },
                (_, index) => `"k${index}":[]`,
            );

            expect(readDocument(`{${keys.join(",")}}`)).toEqual({
                ok: false,
                reason: "too_many_collections",
            });
        });

        test("accepts exactly the ceiling", () => {
            const keys = Array.from({ length: MAX_COLLECTIONS }, (_, index) => `"k${index}":[]`);

            expect(readDocument(`{${keys.join(",")}}`).ok).toBe(true);
        });

        test("refuses a collection past the item ceiling, naming it", () => {
            const items = Array.from({ length: MAX_ITEMS_PER_COLLECTION + 1 }, () => "{}");

            expect(readDocument(`{"posts":[${items.join(",")}]}`)).toEqual({
                ok: false,
                reason: "too_many_items",
                resource: "posts",
            });
        });

        test("refuses a document past the byte ceiling", () => {
            const padding = "x".repeat(MAX_UPLOAD_BYTES);

            expect(readDocument(`{"posts":[{"t":"${padding}"}]}`)).toEqual({
                ok: false,
                reason: "too_large",
            });
        });

        /**
         * Measured after ids are added, not before. A document that only fitted
         * without them would otherwise be stored already over its own ceiling.
         */
        test("counts generated ids against the byte ceiling", () => {
            const tiny = 40;
            const result = readDocument('{"posts":[{"title":"aaaaaaaaaaaaaaaaaaaa"}]}', tiny);

            expect(result).toEqual({ ok: false, reason: "too_large" });
        });

        test("refuses a document nested past the depth ceiling", () => {
            const deep = `{"a":${"[".repeat(MAX_DOCUMENT_DEPTH + 2)}1${"]".repeat(MAX_DOCUMENT_DEPTH + 2)}}`;

            expect(readDocument(deep)).toEqual({ ok: false, reason: "too_deep" });
        });
    });

    /** Last one wins, which is what every JSON reader does. */
    test("a duplicate top-level key resolves rather than failing", () => {
        const result = ok('{"posts":[{"id":"1"}],"posts":[{"id":"9"}]}');

        expect((result.document.posts as JsonObject[])[0].id).toBe("9");
    });
});

describe("checkDocument", () => {
    /** A stored row is re-read through the same rules on its way back out. */
    test("applies the same rules to a value that was never text", () => {
        const result = checkDocument({ posts: [{ id: 7, t: "x" }] });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect((result.document.posts as JsonObject[])[0].id).toBe("7");
    });

    test("refuses a stored value that is not an object", () => {
        expect(checkDocument([1, 2])).toEqual({ ok: false, reason: "not_an_object" });
        expect(checkDocument(null)).toEqual({ ok: false, reason: "not_an_object" });
    });
});

describe("isRoutableName", () => {
    test("accepts what can be a path segment", () => {
        for (const name of ["posts", "blog_posts", "a", "v2-items", "Posts9"]) {
            expect(isRoutableName(name)).toBe(true);
        }
    });

    /** A key needing escaping to appear in a URL would make its routes unusable. */
    test("rejects what cannot", () => {
        for (const name of ["a/b", "a b", "?x", "", "_leading", "-leading", "ünïcode", "a.b"]) {
            expect(isRoutableName(name)).toBe(false);
        }
    });

    test("an unroutable key is kept in the document and marked, not dropped", () => {
        const result = ok('{"a/b":[{"id":"1"}],"posts":[{"id":"1"}]}');

        expect(result.document["a/b"]).toBeDefined();
        expect(result.resources.map((resource) => resource.routable)).toEqual([false, true]);
    });
});

describe("summarize", () => {
    test("counts records and lists fields in first-seen order", () => {
        const [posts] = summarize({
            posts: [
                { id: "1", title: "a" },
                { id: "2", views: 3 },
            ],
        });

        expect(posts.count).toBe(2);
        expect(posts.fields).toEqual(["id", "title", "views"]);
    });

    test("a singular resource reports its own keys and no count", () => {
        const [profile] = summarize({ profile: { name: "t", city: "p" } });

        expect(profile.kind).toBe("singular");
        expect(profile.count).toBe(0);
        expect(profile.fields).toEqual(["name", "city"]);
    });
});

describe("writeDocument", () => {
    /**
     * One writer for the editor, the size measurement and the stored row — or
     * the usage bar disagrees with the box above it.
     */
    test("round-trips through the reader unchanged", () => {
        const once = ok(README_DB);
        const twice = ok(once.text);

        expect(twice.text).toBe(once.text);
        expect(twice.bytes).toBe(once.bytes);
    });

    test("indents with two spaces and keeps key order", () => {
        expect(writeDocument({ b: 1, a: 2 })).toBe('{\n  "b": 1,\n  "a": 2\n}');
    });
});
