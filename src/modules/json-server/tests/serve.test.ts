import { describe, expect, test } from "bun:test";

import {
    MAX_DOCUMENT_BYTES,
    MAX_ITEMS_PER_COLLECTION,
} from "@/modules/json-server/domain/constants";
import { documentBytes } from "@/modules/json-server/domain/document";
import { allowedMethods, deriveRoutes, parsePath } from "@/modules/json-server/domain/routes";
import { serve } from "@/modules/json-server/domain/serve";
import type {
    HttpMethod,
    JsonDocument,
    JsonObject,
    JsonValue,
    ServeRequest,
} from "@/modules/json-server/types";

const DB: JsonDocument = {
    posts: [
        { id: "1", title: "a title", views: 100 },
        { id: "2", title: "another title", views: 200 },
    ],
    comments: [
        { id: "1", text: "a comment about post 1", postId: "1" },
        { id: "2", text: "another comment about post 1", postId: "1" },
    ],
    profile: { name: "typicode" },
    tags: ["a", "b"],
};

type RequestOptions = Partial<Omit<ServeRequest, "method" | "path">> & {
    readonly document?: JsonDocument;
};

function request(method: HttpMethod, path: string, options: RequestOptions = {}) {
    const document = options.document ?? DB;

    return serve(
        { method, path, query: options.query ?? [], body: options.body ?? "" },
        document,
        documentBytes(document),
    );
}

function body(outcome: { body: string }): JsonValue {
    return JSON.parse(outcome.body) as JsonValue;
}

function header(outcome: { headers: readonly (readonly [string, string])[] }, name: string) {
    return outcome.headers.find(([key]) => key === name)?.[1];
}

describe("parsePath", () => {
    test("names what each shape of path points at", () => {
        expect(parsePath("/")).toEqual({ kind: "root" });
        expect(parsePath("/posts")).toEqual({ kind: "resource", resource: "posts" });
        expect(parsePath("/posts/1")).toEqual({ kind: "record", resource: "posts", id: "1" });
        expect(parsePath("/a/b/c")).toEqual({ kind: "unknown" });
    });

    test("a trailing slash changes nothing", () => {
        expect(parsePath("/posts/")).toEqual({ kind: "resource", resource: "posts" });
    });

    /**
     * Decoding before splitting turns a `%2F` into a separator and one segment
     * into two, which is how a traversal gets through a router that reads as
     * correct.
     */
    test("decodes each segment only after splitting", () => {
        expect(parsePath("/posts/a%2Fb")).toEqual({
            kind: "record",
            resource: "posts",
            id: "a/b",
        });
    });

    /** `decodeURIComponent` throws on a lone `%`; a 400 nobody asked for is worse. */
    test("a malformed escape keeps its literal text", () => {
        expect(parsePath("/posts/100%")).toEqual({
            kind: "record",
            resource: "posts",
            id: "100%",
        });
    });
});

describe("deriveRoutes", () => {
    test("a collection publishes six routes", () => {
        const routes = deriveRoutes({ posts: [{ id: "1" }] });

        expect(routes.map((route) => `${route.method} ${route.pattern}`)).toEqual([
            "GET /posts",
            "POST /posts",
            "GET /posts/:id",
            "PUT /posts/:id",
            "PATCH /posts/:id",
            "DELETE /posts/:id",
        ]);
    });

    /** Nothing to POST a second of, and no id to DELETE by. */
    test("a singular resource publishes three, with no id", () => {
        const routes = deriveRoutes({ profile: { name: "t" } });

        expect(routes.map((route) => `${route.method} ${route.pattern}`)).toEqual([
            "GET /profile",
            "PUT /profile",
            "PATCH /profile",
        ]);
    });

    test("an opaque value is readable and nothing else", () => {
        expect(deriveRoutes({ tags: ["a"] }).map((route) => route.method)).toEqual(["GET"]);
    });

    /**
     * The one property that has to hold: the studio's list and the server's
     * matcher come from this function, so a route printed on the page cannot
     * answer 404.
     */
    test("every derived route is one the matcher allows", () => {
        for (const route of deriveRoutes(DB)) {
            const path = route.pattern.replace(":id", "1");

            expect(allowedMethods(DB, parsePath(path))).toContain(route.method);
        }
    });

    test("an unroutable key publishes nothing", () => {
        expect(deriveRoutes({ "a/b": [{ id: "1" }] })).toEqual([]);
    });

    test("marks which routes write", () => {
        const routes = deriveRoutes({ posts: [] });

        expect(routes.filter((route) => route.writes).map((route) => route.method)).toEqual([
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        ]);
    });
});

describe("GET", () => {
    test("the root serves the whole document", () => {
        expect(body(request("GET", "/"))).toEqual(DB);
    });

    test("a collection serves its records", () => {
        expect(body(request("GET", "/posts"))).toEqual(DB.posts);
    });

    test("a list carries X-Total-Count", () => {
        expect(header(request("GET", "/posts"), "x-total-count")).toBe("2");
    });

    test("a record serves itself", () => {
        expect(body(request("GET", "/posts/1"))).toEqual({
            id: "1",
            title: "a title",
            views: 100,
        });
    });

    test("a singular resource serves its object", () => {
        expect(body(request("GET", "/profile"))).toEqual({ name: "typicode" });
    });

    test("an opaque value is readable", () => {
        expect(body(request("GET", "/tags"))).toEqual(["a", "b"]);
    });

    test("an unknown resource is 404", () => {
        expect(request("GET", "/nope").status).toBe(404);
    });

    test("an unknown record is 404", () => {
        expect(request("GET", "/posts/99").status).toBe(404);
    });

    test("a path too deep to name anything is 404", () => {
        expect(request("GET", "/posts/1/comments").status).toBe(404);
    });

    test("filters through the query", () => {
        const outcome = request("GET", "/posts", { query: [["views:gt", "150"]] });

        expect(body(outcome)).toEqual([DB.posts as JsonValue].flat().slice(1));
    });

    test("paginates into the envelope", () => {
        const outcome = request("GET", "/posts", {
            query: [
                ["_page", "1"],
                ["_per_page", "1"],
            ],
        });

        expect(body(outcome)).toMatchObject({ items: 2, pages: 2, next: 2, prev: null });
    });

    test("embeds children", () => {
        const outcome = request("GET", "/posts", { query: [["_embed", "comments"]] });
        const [first] = body(outcome) as JsonObject[];

        expect(first.comments).toHaveLength(2);
    });

    test("a malformed query is 400 rather than an unfiltered list", () => {
        expect(request("GET", "/posts", { query: [["views:nope", "1"]] }).status).toBe(400);
    });

    /** No filtering or paging on something that is not a list. */
    test("a query against a singular resource is ignored, not an error", () => {
        const outcome = request("GET", "/profile", { query: [["_page", "2"]] });

        expect(outcome.status).toBe(200);
        expect(body(outcome)).toEqual({ name: "typicode" });
    });

    test("changes nothing, so the repository can skip the row lock", () => {
        expect(request("GET", "/posts").document).toBeNull();
    });
});

describe("HEAD and OPTIONS", () => {
    /** HTTP defines HEAD as GET without a body; two branches is two to keep in step. */
    test("HEAD answers exactly as GET does", () => {
        const head = request("HEAD", "/posts");
        const get = request("GET", "/posts");

        expect(head.status).toBe(get.status);
        expect(head.body).toBe(get.body);
    });

    test("an undefined OPTIONS is answered from what the path supports", () => {
        const outcome = request("OPTIONS", "/posts");

        expect(outcome.status).toBe(204);
        expect(header(outcome, "allow")).toContain("POST");
        expect(header(outcome, "access-control-allow-methods")).toContain("GET");
    });

    test("OPTIONS on nothing is still 404", () => {
        expect(request("OPTIONS", "/nope").status).toBe(404);
    });
});

describe("405 versus 404", () => {
    /**
     * The distinction most hosted mock servers fold together, and the one a
     * client debugging an integration actually needs: a typo is not a missing
     * handler.
     */
    test("a path that exists under another method is 405 with Allow", () => {
        const outcome = request("DELETE", "/profile");

        expect(outcome.status).toBe(405);
        expect(header(outcome, "allow")).toBe("GET, PUT, PATCH, HEAD, OPTIONS");
    });

    test("POST to a record is 405, not 404", () => {
        expect(request("POST", "/posts/1").status).toBe(405);
    });

    test("a path that does not exist is 404 with no Allow", () => {
        const outcome = request("DELETE", "/nope");

        expect(outcome.status).toBe(404);
        expect(header(outcome, "allow")).toBeUndefined();
    });

    test("writing to an opaque value is 405", () => {
        expect(request("PATCH", "/tags").status).toBe(405);
    });
});

describe("POST", () => {
    test("appends the record and returns 201", () => {
        const outcome = request("POST", "/posts", { body: '{"title":"new"}' });

        expect(outcome.status).toBe(201);
        expect(body(outcome)).toEqual({ title: "new", id: "3" });
    });

    /** The only way the caller learns what to ask for next. */
    test("carries a Location pointing at the new record", () => {
        expect(header(request("POST", "/posts", { body: '{"t":1}' }), "location")).toBe("/posts/3");
    });

    test("returns the next document with the record in it", () => {
        const outcome = request("POST", "/posts", { body: '{"title":"new"}' });

        expect((outcome.document?.posts as JsonObject[]).map((row) => row.id)).toEqual([
            "1",
            "2",
            "3",
        ]);
    });

    test("honours an id the caller named", () => {
        const outcome = request("POST", "/posts", { body: '{"id":"known","t":1}' });

        expect((body(outcome) as JsonObject).id).toBe("known");
    });

    /** A POST that replaced a record is data loss wearing a success. */
    test("refuses an id already taken rather than overwriting", () => {
        const outcome = request("POST", "/posts", { body: '{"id":"1","t":1}' });

        expect(outcome.status).toBe(409);
        expect(outcome.document).toBeNull();
    });

    test("into an empty collection starts at 1", () => {
        const outcome = request("POST", "/posts", {
            document: { posts: [] },
            body: '{"t":1}',
        });

        expect((body(outcome) as JsonObject).id).toBe("1");
    });

    test("a body that is not JSON is 400", () => {
        expect(request("POST", "/posts", { body: "{nope" }).status).toBe(400);
    });

    test("an empty body is 400", () => {
        expect(request("POST", "/posts", { body: "" }).status).toBe(400);
    });

    test("an array body is 400 — a record is an object", () => {
        expect(request("POST", "/posts", { body: "[1,2]" }).status).toBe(400);
    });

    test("refuses past the per-collection ceiling", () => {
        const full = {
            posts: Array.from({ length: MAX_ITEMS_PER_COLLECTION }, (_, index) => ({
                id: String(index + 1),
            })),
        };
        const outcome = serve(
            { method: "POST", path: "/posts", query: [], body: '{"t":1}' },
            full,
            0,
        );

        expect(outcome.status).toBe(507);
    });
});

describe("PUT and PATCH", () => {
    test("PUT replaces every field but the id", () => {
        const outcome = request("PUT", "/posts/1", { body: '{"title":"only"}' });

        expect(body(outcome)).toEqual({ title: "only", id: "1" });
    });

    test("PATCH merges", () => {
        const outcome = request("PATCH", "/posts/1", { body: '{"views":5}' });

        expect(body(outcome)).toEqual({ id: "1", title: "a title", views: 5 });
    });

    /**
     * Honouring an id in the body would move a record to an address the caller
     * did not request, silently orphaning everything that referred to it.
     */
    test("neither takes a new id from the body", () => {
        for (const method of ["PUT", "PATCH"] as const) {
            const outcome = request(method, "/posts/1", { body: '{"id":"9","t":1}' });

            expect((body(outcome) as JsonObject).id).toBe("1");
        }
    });

    test("PUT on a singular resource replaces it", () => {
        const outcome = request("PUT", "/profile", { body: '{"city":"paris"}' });

        expect(body(outcome)).toEqual({ city: "paris" });
    });

    test("PATCH on a singular resource merges", () => {
        const outcome = request("PATCH", "/profile", { body: '{"city":"paris"}' });

        expect(body(outcome)).toEqual({ name: "typicode", city: "paris" });
    });

    test("on a record that does not exist is 404", () => {
        expect(request("PATCH", "/posts/99", { body: "{}" }).status).toBe(404);
    });

    test("leaves the rest of the document alone", () => {
        const outcome = request("PATCH", "/posts/1", { body: '{"views":5}' });

        expect(outcome.document?.comments).toEqual(DB.comments);
        expect(outcome.document?.profile).toEqual(DB.profile);
    });
});

describe("DELETE", () => {
    test("removes the record and returns it", () => {
        const outcome = request("DELETE", "/posts/1");

        expect(body(outcome)).toEqual({ id: "1", title: "a title", views: 100 });
        expect((outcome.document?.posts as JsonObject[]).map((row) => row.id)).toEqual(["2"]);
    });

    test("on a record that does not exist is 404", () => {
        expect(request("DELETE", "/posts/99").status).toBe(404);
    });

    /**
     * The half an implementation forgets, and it happens whether or not
     * `_dependent` was asked for: every other collection's foreign keys pointing
     * at the deleted id are set to `null`. Cross-checked against the reference's
     * `nullifyForeignKey`.
     */
    test("nulls the foreign keys that pointed at it, even without _dependent", () => {
        const outcome = request("DELETE", "/posts/1");

        expect(outcome.document?.comments).toEqual([
            { id: "1", text: "a comment about post 1", postId: null },
            { id: "2", text: "another comment about post 1", postId: null },
        ]);
    });

    test("_dependent then removes the children whose key is now null", () => {
        const outcome = request("DELETE", "/posts/1", {
            query: [["_dependent", "comments"]],
        });

        expect(outcome.document?.comments).toEqual([]);
    });

    /** A cascade nobody asked for is how a fixture loses half its rows. */
    test("without _dependent the children stay, only re-pointed", () => {
        expect(request("DELETE", "/posts/1").document?.comments).toHaveLength(2);
    });

    /**
     * The reference's `_dependent` deletes on "foreign key is null", not on
     * "pointed at the record just deleted" — so a child that was already
     * orphaned is swept up too. Worth pinning rather than rediscovering.
     */
    test("_dependent also removes children that were already orphaned", () => {
        const withOrphan: JsonDocument = {
            posts: [{ id: "1" }, { id: "2" }],
            comments: [
                { id: "1", postId: "2" },
                { id: "2", postId: null },
            ],
        };
        const outcome = request("DELETE", "/posts/1", {
            document: withOrphan,
            query: [["_dependent", "comments"]],
        });

        expect(outcome.document?.comments).toEqual([{ id: "1", postId: "2" }]);
    });

    test("_dependent naming something that is not a collection is ignored", () => {
        const outcome = request("DELETE", "/posts/1", { query: [["_dependent", "profile"]] });

        expect(outcome.document?.profile).toEqual(DB.profile);
    });
});

describe("the size lock", () => {
    const full = MAX_DOCUMENT_BYTES;

    function atSize(method: HttpMethod, path: string, bytes: number, requestBody = "{}") {
        return serve({ method, path, query: [], body: requestBody }, DB, bytes);
    }

    test("POST, PUT and PATCH are refused at the ceiling", () => {
        expect(atSize("POST", "/posts", full, '{"t":1}').status).toBe(507);
        expect(atSize("PUT", "/posts/1", full).status).toBe(507);
        expect(atSize("PATCH", "/posts/1", full).status).toBe(507);
    });

    /**
     * The property that makes the lock recoverable rather than a trap: reading
     * still works, and deleting a record is the way out. A ceiling that blocked
     * every write would leave discarding the whole document as the only escape.
     */
    test("GET and DELETE still work at the ceiling", () => {
        expect(atSize("GET", "/posts", full).status).toBe(200);
        expect(atSize("DELETE", "/posts/1", full).status).toBe(200);
    });

    test("OPTIONS still works at the ceiling", () => {
        expect(atSize("OPTIONS", "/posts", full).status).toBe(204);
    });

    test("one byte under the ceiling still accepts a write", () => {
        expect(atSize("POST", "/posts", full - 1, '{"t":1}').status).toBe(201);
    });

    test("the refusal names itself so the studio can explain it", () => {
        expect(body(atSize("POST", "/posts", full, '{"t":1}'))).toEqual({
            error: "document_full",
            status: 507,
        });
    });

    test("a refused write changes nothing", () => {
        expect(atSize("POST", "/posts", full, '{"t":1}').document).toBeNull();
    });
});

describe("the stored byte count", () => {
    /** The number stored and the number the usage bar shows have to be one number. */
    test("a write reports the size of the document it produced", () => {
        const outcome = request("POST", "/posts", { body: '{"title":"new"}' });

        expect(outcome.document).not.toBeNull();
        expect(outcome.bytes).toBe(documentBytes(outcome.document as JsonDocument));
    });

    test("a delete reports a smaller document", () => {
        const outcome = request("DELETE", "/posts/1");

        expect(outcome.bytes).toBeLessThan(documentBytes(DB));
    });

    test("a read reports nothing to store", () => {
        expect(request("GET", "/posts").bytes).toBe(0);
    });
});

describe("immutability", () => {
    /**
     * The engine is handed the live document. Mutating it in place would leave
     * the row and the response describing different things whenever a write
     * later failed.
     */
    test("never mutates the document it was given", () => {
        const before = JSON.stringify(DB);

        request("POST", "/posts", { body: '{"t":1}' });
        request("DELETE", "/posts/1", { query: [["_dependent", "comments"]] });
        request("PUT", "/posts/1", { body: '{"t":1}' });
        request("PATCH", "/profile", { body: '{"city":"x"}' });

        expect(JSON.stringify(DB)).toBe(before);
    });
});
