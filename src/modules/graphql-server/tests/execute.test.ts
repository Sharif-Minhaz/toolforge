import { describe, expect, test } from "bun:test";

import { executeRequest, planRequest } from "@/modules/graphql-server/domain/execute";
import type { GraphqlOutcome, GraphqlRequest } from "@/modules/graphql-server/types";
import { MAX_DOCUMENT_BYTES } from "@/modules/tools/domain/document-limits";
import type { JsonDocument } from "@/modules/tools/types/json-document";

/**
 * The engine end to end: a document in, a GraphQL response out.
 *
 * Everything here goes through the same two calls the route handler makes, so a
 * behaviour that passes here is the behaviour a real client gets — the whole
 * point of keeping `planRequest` and `executeRequest` pure.
 */

const DB: JsonDocument = {
    posts: [
        { id: "1", title: "a title", views: 100, draft: false },
        { id: "2", title: "another title", views: 200, draft: true },
        { id: "3", title: "Third POST", views: 50, draft: false },
    ],
    comments: [
        { id: "1", text: "a comment about post 1", postId: "1" },
        { id: "2", text: "another comment about post 1", postId: "1" },
        { id: "3", text: "about post 2", postId: "2" },
    ],
    profile: { name: "typicode" },
    tags: ["a", "b"],
};

type Answer = {
    readonly outcome: GraphqlOutcome;
    readonly data: Record<string, unknown> | undefined;
    readonly errors: { message: string; extensions?: Record<string, unknown> }[] | undefined;
};

function run(
    query: string,
    options: {
        document?: JsonDocument;
        variables?: Record<string, unknown>;
        allowMutation?: boolean;
        storedBytes?: number;
        operationName?: string;
    } = {},
): Answer {
    const request: GraphqlRequest = {
        query,
        variables: options.variables ?? null,
        operationName: options.operationName ?? null,
        allowMutation: options.allowMutation ?? true,
    };

    const plan = planRequest(request);

    if (!plan.ok) {
        return {
            outcome: {
                status: 400,
                body: JSON.stringify({ errors: [{ message: plan.message }] }),
                document: null,
                bytes: 0,
                cost: 0,
                depth: 0,
                operationName: null,
            },
            data: undefined,
            errors: [{ message: plan.message, extensions: { code: plan.reason.toUpperCase() } }],
        };
    }

    const outcome = executeRequest(plan, request, options.document ?? DB, options.storedBytes ?? 0);
    const parsed = JSON.parse(outcome.body) as {
        data?: Record<string, unknown>;
        errors?: { message: string; extensions?: Record<string, unknown> }[];
    };

    return { outcome, data: parsed.data, errors: parsed.errors };
}

describe("queries", () => {
    test("a collection returns its records", () => {
        const { data } = run(`{ posts { id title views } }`);

        expect(data?.posts).toEqual([
            { id: "1", title: "a title", views: 100 },
            { id: "2", title: "another title", views: 200 },
            { id: "3", title: "Third POST", views: 50 },
        ]);
    });

    test("a record by id, and null for one that is not there", () => {
        expect(run(`{ post(id: "2") { title } }`).data?.post).toEqual({
            title: "another title",
        });
        expect(run(`{ post(id: "99") { title } }`).data?.post).toBeNull();
    });

    test("a singular resource is returned whole", () => {
        expect(run(`{ profile { name } }`).data?.profile).toEqual({ name: "typicode" });
    });

    test("an opaque value comes back exactly as stored", () => {
        expect(run(`{ tags }`).data?.tags).toEqual(["a", "b"]);
    });

    test("the connection carries the total the page was taken from", () => {
        const { data } = run(
            `{ postsConnection(perPage: 2) { total pages page perPage nodes { id } } }`,
        );

        expect(data?.postsConnection).toEqual({
            total: 3,
            pages: 2,
            page: 1,
            perPage: 2,
            nodes: [{ id: "1" }, { id: "2" }],
        });
    });

    test("a page past the end is empty rather than an error", () => {
        const { data, errors } = run(
            `{ postsConnection(page: 9, perPage: 2) { nodes { id } total } }`,
        );

        expect(errors).toBeUndefined();
        expect(data?.postsConnection).toEqual({ nodes: [], total: 3 });
    });
});

describe("filtering", () => {
    test("a comparison operator", () => {
        expect(run(`{ posts(where: { views: { gt: 75 } }) { id } }`).data?.posts).toEqual([
            { id: "1" },
            { id: "2" },
        ]);
    });

    test("two operators on one field are a range, not a choice", () => {
        expect(run(`{ posts(where: { views: { gt: 75, lt: 150 } }) { id } }`).data?.posts).toEqual([
            { id: "1" },
        ]);
    });

    test("two fields AND together", () => {
        expect(
            run(`{ posts(where: { views: { gt: 75 }, draft: { eq: true } }) { id } }`).data?.posts,
        ).toEqual([{ id: "2" }]);
    });

    test("contains is case-insensitive, matching the REST studio", () => {
        expect(
            run(`{ posts(where: { title: { contains: "TITLE" } }) { id } }`).data?.posts,
        ).toEqual([{ id: "1" }, { id: "2" }]);
    });

    test("eq is case-sensitive, also matching the REST studio", () => {
        expect(run(`{ posts(where: { title: { eq: "A TITLE" } }) { id } }`).data?.posts).toEqual(
            [],
        );
    });

    test("in and nin", () => {
        expect(run(`{ posts(where: { id: { in: ["1", "3"] } }) { id } }`).data?.posts).toEqual([
            { id: "1" },
            { id: "3" },
        ]);
        expect(run(`{ posts(where: { id: { nin: ["1", "3"] } }) { id } }`).data?.posts).toEqual([
            { id: "2" },
        ]);
    });

    test("AND, OR and NOT nest", () => {
        expect(
            run(`{ posts(where: { OR: [{ views: { lt: 60 } }, { views: { gt: 150 } }] }) { id } }`)
                .data?.posts,
        ).toEqual([{ id: "2" }, { id: "3" }]);

        expect(
            run(`{ posts(where: { NOT: { draft: { eq: true } } }) { id } }`).data?.posts,
        ).toEqual([{ id: "1" }, { id: "3" }]);
    });

    test("a filter naming a field the type does not have is a validation error", () => {
        // The value of a typed schema over a query string: this is refused with
        // a message naming the field rather than silently matching everything.
        const { errors, outcome } = run(`{ posts(where: { nope: { eq: 1 } }) { id } }`);

        expect(outcome.status).toBe(400);
        expect(errors?.[0].message).toContain("nope");
    });

    test("a JSON field has no filter, because no comparison over one is meaningful", () => {
        const { outcome } = run(`{ posts(where: { author: { eq: 1 } }) { id } }`, {
            document: { posts: [{ id: "1", author: { name: "a" } }] },
        });

        expect(outcome.status).toBe(400);
    });
});

describe("sorting", () => {
    test("orders ascending by default", () => {
        expect(run(`{ posts(orderBy: views) { id } }`).data?.posts).toEqual([
            { id: "3" },
            { id: "1" },
            { id: "2" },
        ]);
    });

    test("orders descending when asked", () => {
        expect(run(`{ posts(orderBy: views, order: DESC) { id } }`).data?.posts).toEqual([
            { id: "2" },
            { id: "1" },
            { id: "3" },
        ]);
    });

    test("strings compare with localeCompare, exactly as the REST studio does", () => {
        // A code-unit comparison would put every capital first, so `Third POST`
        // would lead. The same document served through `/j` sorts this way, and
        // the two must not disagree.
        expect(run(`{ posts(orderBy: title) { title } }`).data?.posts).toEqual([
            { title: "a title" },
            { title: "another title" },
            { title: "Third POST" },
        ]);
    });

    test("falsy sorts last ascending, which puts true first on a boolean", () => {
        // Inherited from the REST studio's `sort-on` behaviour and matched on
        // purpose: one document served two ways must not reorder.
        expect(run(`{ posts(orderBy: draft) { id draft } }`).data?.posts).toEqual([
            { id: "2", draft: true },
            { id: "1", draft: false },
            { id: "3", draft: false },
        ]);
    });

    test("zero is not falsy for this purpose", () => {
        const document: JsonDocument = {
            posts: [
                { id: "1", views: 0 },
                { id: "2", views: null },
                { id: "3", views: 5 },
            ],
        };

        expect(run(`{ posts(orderBy: views) { id } }`, { document }).data?.posts).toEqual([
            { id: "1" },
            { id: "3" },
            { id: "2" },
        ]);
    });
});

describe("relations", () => {
    test("the child side reaches its parent in one round trip", () => {
        expect(run(`{ comments(perPage: 1) { id post { title } } }`).data?.comments).toEqual([
            { id: "1", post: { title: "a title" } },
        ]);
    });

    test("the parent side reaches its children", () => {
        expect(run(`{ post(id: "1") { comments { id } } }`).data?.post).toEqual({
            comments: [{ id: "1" }, { id: "2" }],
        });
    });

    test("a parent with no children gets an empty list, not null", () => {
        expect(run(`{ post(id: "3") { comments { id } } }`).data?.post).toEqual({ comments: [] });
    });

    test("a dangling foreign key resolves to null rather than erroring", () => {
        const document: JsonDocument = {
            posts: [{ id: "1" }],
            comments: [{ id: "1", postId: "99" }],
        };

        expect(run(`{ comments { post { id } } }`, { document }).data?.comments).toEqual([
            { post: null },
        ]);
    });

    test("the many side takes a page size", () => {
        expect(run(`{ post(id: "1") { comments(perPage: 1) { id } } }`).data?.post).toEqual({
            comments: [{ id: "1" }],
        });
    });
});

describe("mutations", () => {
    test("create returns the record including the generated id", () => {
        const { data, outcome } = run(
            `mutation { createPost(input: { title: "new", views: 1, draft: false }) { id title } }`,
        );

        expect(data?.createPost).toEqual({ id: "4", title: "new" });
        expect(outcome.document).not.toBeNull();
        expect((outcome.document as JsonDocument).posts).toHaveLength(4);
    });

    test("create honours an id the caller chose", () => {
        const { data } = run(`mutation { createPost(input: { id: "abc", title: "t" }) { id } }`);

        expect(data?.createPost).toEqual({ id: "abc" });
    });

    test("create refuses an id that is already taken", () => {
        const { errors, outcome } = run(`mutation { createPost(input: { id: "1" }) { id } }`);

        expect(errors?.[0].message).toContain("already exists");
        expect(outcome.document).toBeNull();
    });

    test("update replaces: a field left out is removed", () => {
        const { outcome } = run(
            `mutation { updatePost(id: "1", input: { title: "only" }) { id } }`,
        );
        const posts = (outcome.document as JsonDocument).posts as Record<string, unknown>[];

        expect(posts[0]).toEqual({ id: "1", title: "only" });
    });

    test("patch merges: a field left out is kept", () => {
        const { outcome } = run(`mutation { patchPost(id: "1", input: { title: "only" }) { id } }`);
        const posts = (outcome.document as JsonDocument).posts as Record<string, unknown>[];

        expect(posts[0]).toEqual({ id: "1", title: "only", views: 100, draft: false });
    });

    test("a record's id can never be changed", () => {
        // Not accepted and ignored — absent from the input type, so the caller
        // is told at validation instead of discovering their write went
        // somewhere else.
        const { outcome, errors } = run(
            `mutation { patchPost(id: "1", input: { id: "9" }) { id } }`,
        );

        expect(outcome.status).toBe(400);
        expect(errors?.[0].message).toContain("id");
    });

    test("delete returns what it removed, and null when it was already gone", () => {
        const { data, outcome } = run(`mutation { deletePost(id: "2") { id title } }`);

        expect(data?.deletePost).toEqual({ id: "2", title: "another title" });
        expect((outcome.document as JsonDocument).posts).toHaveLength(2);

        expect(run(`mutation { deletePost(id: "99") { id } }`).data?.deletePost).toBeNull();
    });

    test("a mutation that changes nothing writes nothing", () => {
        expect(run(`mutation { deletePost(id: "99") { id } }`).outcome.document).toBeNull();
    });

    test("a singular resource can be replaced and merged, but not created", () => {
        expect(run(`mutation { patchProfile(input: { name: "ada" }) { name } }`).data).toEqual({
            patchProfile: { name: "ada" },
        });
        expect(run(`mutation { createProfile(input: {}) { name } }`).outcome.status).toBe(400);
    });

    test("two mutations in one document run in order and both land", () => {
        // GraphQL requires root mutation fields to execute serially, which is
        // what makes this mean what it reads as.
        const { outcome } = run(
            `mutation { a: createPost(input: { title: "x" }) { id } b: deletePost(id: "1") { id } }`,
        );
        const posts = (outcome.document as JsonDocument).posts as Record<string, unknown>[];

        expect(posts.map((post) => post.id)).toEqual(["2", "3", "4"]);
    });
});

describe("the transport's rights", () => {
    test("a mutation over GET is refused", () => {
        const { outcome, errors } = run(`mutation { deletePost(id: "1") { id } }`, {
            allowMutation: false,
        });

        expect(outcome.status).toBe(405);
        expect(errors?.[0].extensions?.code).toBe("MUTATION_OVER_GET");
        expect(outcome.document).toBeNull();
    });

    test("a query over GET is fine", () => {
        expect(run(`{ posts { id } }`, { allowMutation: false }).outcome.status).toBe(200);
    });
});

describe("the size lock", () => {
    test("a full document refuses a create", () => {
        const { errors, outcome } = run(`mutation { createPost(input: { title: "x" }) { id } }`, {
            storedBytes: MAX_DOCUMENT_BYTES,
        });

        expect(errors?.[0].message).toContain("size limit");
        expect(outcome.document).toBeNull();
    });

    test("a full document still allows a delete, which is the way out", () => {
        // A ceiling that refused every write would be a trap whose only escape
        // is discarding the whole document.
        const { outcome } = run(`mutation { deletePost(id: "1") { id } }`, {
            storedBytes: MAX_DOCUMENT_BYTES,
        });

        expect(outcome.document).not.toBeNull();
    });

    test("a full document still answers reads", () => {
        expect(run(`{ posts { id } }`, { storedBytes: MAX_DOCUMENT_BYTES }).outcome.status).toBe(
            200,
        );
    });
});

describe("refusals", () => {
    test("an empty query", () => {
        expect(run("").errors?.[0].extensions?.code).toBe("MISSING_QUERY");
    });

    test("a syntax error is reported with the parser's own message", () => {
        expect(run("{ posts {").errors?.[0].extensions?.code).toBe("PARSE_FAILED");
    });

    test("an unknown field", () => {
        const { outcome, errors } = run(`{ nope { id } }`);

        expect(outcome.status).toBe(400);
        expect(errors?.[0].message).toContain("nope");
    });

    test("a subscription", () => {
        const { errors } = run(`subscription { posts { id } }`);

        expect(errors?.[0].message).toContain("Subscriptions are not supported");
    });

    test("two operations with no name says which is missing", () => {
        expect(
            run(`query A { posts { id } } query B { posts { id } }`).errors?.[0].message,
        ).toContain("several");
    });

    test("naming one of two operations runs that one", () => {
        const { data } = run(`query A { posts { id } } query B { profile { name } }`, {
            operationName: "B",
        });

        expect(data).toEqual({ profile: { name: "typicode" } });
    });
});

describe("introspection", () => {
    test("the schema is introspectable, which is what makes an IDE work", () => {
        const { data, outcome } = run(`{ __schema { queryType { name } } }`);

        expect(outcome.status).toBe(200);
        expect(data?.__schema).toEqual({ queryType: { name: "Query" } });
    });

    test("a full introspection walk is not refused by the cost guard", () => {
        // Nine levels of `__type` would blow the node budget if introspection
        // were charged the same per-level multiplier as a data field, and an
        // endpoint that cannot be introspected is one no codegen tool can use.
        const { outcome } = run(`{
            __schema {
                types {
                    name
                    fields {
                        name
                        args { name type { name ofType { name ofType { name } } } }
                        type { name kind ofType { name kind ofType { name } } }
                    }
                }
            }
        }`);

        expect(outcome.status).toBe(200);
    });

    test("an empty document still produces a valid, introspectable schema", () => {
        const { outcome, data } = run(`{ __schema { queryType { name } } }`, { document: {} });

        expect(outcome.status).toBe(200);
        expect(data?.__schema).toEqual({ queryType: { name: "Query" } });
    });
});

describe("repaired field names", () => {
    test("a field is queried by its published name and written back to its stored key", () => {
        const document: JsonDocument = { people: [{ id: "1", "full-name": "Ada" }] };

        expect(run(`{ people { fullName } }`, { document }).data?.people).toEqual([
            { fullName: "Ada" },
        ]);

        const { outcome } = run(
            `mutation { patchPerson(id: "1", input: { fullName: "Grace" }) { fullName } }`,
            {
                document,
            },
        );
        const people = (outcome.document as JsonDocument).people as Record<string, unknown>[];

        expect(people[0]).toEqual({ id: "1", "full-name": "Grace" });
    });
});
