import { describe, expect, test } from "bun:test";

import { executeGraph } from "@/modules/mock-server/domain/execute";
import { detectImportFormat } from "@/modules/mock-server/domain/import";
import {
    parseRawBody,
    pathFromRawUrl,
    pickSavedResponse,
    readPostman,
    readPostmanBody,
    readPostmanPath,
} from "@/modules/mock-server/domain/postman";
import type {
    ExecutionContext,
    JsonValue,
    NormalizedRequest,
} from "@/modules/mock-server/types/graph";

/**
 * Reading a Postman collection.
 *
 * The fixture is a real export — the one that motivated this reader — kept in
 * the spelling Postman writes rather than tidied: `{{BASE_URL}}` in the host,
 * the split `path` array beside the `raw` string, folders around some requests
 * and not others, and `response: []` on every one of them. That last detail is
 * the important one and the reason half of these tests exist: a collection
 * whose requests were never saved with a response is the ordinary case, not the
 * degenerate one.
 */

const REQUEST: NormalizedRequest = {
    method: "GET",
    path: "/",
    params: {},
    query: {},
    headers: {},
    cookies: {},
    body: null,
};

function context(): ExecutionContext {
    return {
        request: REQUEST,
        env: {},
        clock: () => 0,
        now: () => 0,
        sleep: async () => {},
        random: () => 0.5,
        deadlineAt: Number.MAX_SAFE_INTEGER,
        vars: {},
    };
}

const FLOW_CRAFT = {
    info: {
        _postman_id: "f814d19c-4f81-47a7-9c5f-abd529014edd",
        name: "Flow-craft",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
        {
            name: "program",
            item: [
                {
                    name: "get all programs",
                    request: {
                        method: "GET",
                        header: [],
                        url: {
                            raw: "{{BASE_URL}}/programs/list",
                            host: ["{{BASE_URL}}"],
                            path: ["programs", "list"],
                        },
                    },
                    response: [],
                },
                {
                    name: "create program",
                    request: {
                        method: "POST",
                        header: [],
                        body: {
                            mode: "raw",
                            raw: '{\n    "data": {\n        "Title": "Intro to Node.js",\n        "Price": 49.99,\n        "Status": "Pending"\n    }\n}',
                            options: { raw: { language: "json" } },
                        },
                        url: {
                            raw: "{{BASE_URL}}/programs/new",
                            host: ["{{BASE_URL}}"],
                            path: ["programs", "new"],
                        },
                    },
                    response: [],
                },
            ],
        },
        {
            name: "content",
            item: [
                {
                    name: "get all contents",
                    request: {
                        method: "GET",
                        header: [],
                        url: {
                            raw: "{{BASE_URL}}/content/list",
                            host: ["{{BASE_URL}}"],
                            path: ["content", "list"],
                        },
                    },
                    response: [],
                },
            ],
        },
        {
            name: "test",
            request: {
                method: "GET",
                header: [],
                url: {
                    raw: "{{base_url_local}}/api/hospital/select/allopdroom",
                    host: ["{{base_url_local}}"],
                    path: ["api", "hospital", "select", "allopdroom"],
                },
            },
            response: [],
        },
    ],
    variable: [{ key: "BASE_URL", value: "http://localhost:8000", type: "string" }],
};

describe("detectImportFormat", () => {
    test("reads a collection off its item array", () => {
        expect(detectImportFormat(FLOW_CRAFT)).toBe("postman");
    });

    test("reads a specification off its version key", () => {
        expect(detectImportFormat({ openapi: "3.1.0", paths: {} })).toBe("openapi");
    });

    test("reads Swagger 2 as a specification too", () => {
        expect(detectImportFormat({ swagger: "2.0", paths: {} })).toBe("openapi");
    });

    /** A `paths` object with no version key is still a specification. */
    test("falls back to paths", () => {
        expect(detectImportFormat({ paths: { "/x": {} } })).toBe("openapi");
    });

    /**
     * The refusal has to be its own answer. Valid JSON that is neither format
     * is a different mistake from a file that will not parse, and the panel
     * says so rather than sending somebody hunting for a syntax error.
     */
    test("refuses valid JSON that is neither", () => {
        expect(detectImportFormat({ hello: "world" })).toBeNull();
        expect(detectImportFormat("nope")).toBeNull();
        expect(detectImportFormat([])).toBeNull();
    });
});

describe("pathFromRawUrl", () => {
    /** The address is this studio's to choose; the collection's is history. */
    test("drops a variable host", () => {
        expect(pathFromRawUrl("{{BASE_URL}}/programs/list")).toBe("/programs/list");
    });

    test("drops a scheme and host", () => {
        expect(pathFromRawUrl("https://api.example.com/v1/pets")).toBe("/v1/pets");
    });

    test("drops a bare host and port", () => {
        expect(pathFromRawUrl("localhost:8000/api/health")).toBe("/api/health");
    });

    test("drops the query string and the fragment", () => {
        expect(pathFromRawUrl("{{base}}/search?q=1#top")).toBe("/search");
    });

    /** A relative path keeps its first segment rather than losing it to a host. */
    test("keeps a relative path whole", () => {
        expect(pathFromRawUrl("programs/list")).toBe("/programs/list");
    });

    test("survives a bare host with nothing after it", () => {
        expect(pathFromRawUrl("{{BASE_URL}}")).toBe("/");
    });
});

describe("readPostmanPath", () => {
    test("prefers the split path array", () => {
        expect(
            readPostmanPath({ raw: "{{BASE_URL}}/programs/list", path: ["programs", "list"] }),
        ).toBe("/programs/list");
    });

    /**
     * A variable in a path is a parameter, not its value. A route baked to
     * `/users/42` answers one call; `/users/:userId` answers all of them.
     */
    test("turns a path variable into a route parameter", () => {
        expect(readPostmanPath({ path: ["users", "{{userId}}", "posts"] })).toBe(
            "/users/:userId/posts",
        );
    });

    test("leaves Postman's own colon parameter alone", () => {
        expect(readPostmanPath({ path: ["users", ":id"] })).toBe("/users/:id");
    });

    test("spells out a name this router would not accept", () => {
        expect(readPostmanPath({ path: ["x", "{{user-id}}"] })).toBe("/x/:user_id");
    });

    test("reads the shorthand string url", () => {
        expect(readPostmanPath("https://example.com/health")).toBe("/health");
    });

    test("has no answer for a request with no url", () => {
        expect(readPostmanPath(undefined)).toBeNull();
    });
});

describe("parseRawBody", () => {
    test("reads ordinary JSON", () => {
        expect(parseRawBody('{"a":1}')).toEqual({ a: 1 });
    });

    /** `{"amount": {{amount}}}` is an ordinary thing to find and invalid JSON. */
    test("survives an unquoted placeholder", () => {
        expect(parseRawBody('{"amount": {{amount}}, "id": "{{id}}"}')).toEqual({
            amount: "{{amount}}",
            id: "{{id}}",
        });
    });

    test("keeps a body it cannot parse as its own text", () => {
        expect(parseRawBody("<xml/>")).toBe("<xml/>");
    });

    test("reads an empty body as none at all", () => {
        expect(parseRawBody("   ")).toBeNull();
    });
});

describe("readPostmanBody", () => {
    test("reads a form body as fields", () => {
        expect(
            readPostmanBody({
                body: {
                    mode: "urlencoded",
                    urlencoded: [
                        { key: "title", value: "Holiday" },
                        { key: "draft", value: "1", disabled: true },
                    ],
                },
            }),
        ).toEqual({ example: { title: "Holiday" }, requiredPaths: ["title"] });
    });

    test("reads a GraphQL body, and only the query is required", () => {
        const body = readPostmanBody({
            body: { mode: "graphql", graphql: { query: "{ me { id } }", variables: '{"a":1}' } },
        });

        expect(body.example).toEqual({ query: "{ me { id } }", variables: { a: 1 } });
        expect(body.requiredPaths).toEqual(["query"]);
    });

    test("has nothing to say about a file body", () => {
        expect(readPostmanBody({ body: { mode: "file", file: { src: "/tmp/a.bin" } } })).toEqual({
            example: null,
            requiredPaths: [],
        });
    });
});

describe("pickSavedResponse", () => {
    const responses = [
        { name: "not found", code: 404, body: '{"error":"nope"}' },
        {
            name: "ok",
            code: 200,
            header: [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
            body: '{"id":1}',
        },
        { name: "created", code: 201, body: "{}" },
    ];

    /** Not the first saved one: a caller expects the success case. */
    test("takes the lowest 2xx", () => {
        expect(pickSavedResponse(responses)?.status).toBe(200);
    });

    test("reads the content type the server sent", () => {
        expect(pickSavedResponse(responses)?.contentType).toBe("application/json");
    });

    test("reads a JSON body as a value", () => {
        expect(pickSavedResponse(responses)?.example).toEqual({ id: 1 });
    });

    test("keeps a body that is not JSON as text", () => {
        const text = pickSavedResponse([
            { code: 200, header: [{ key: "Content-Type", value: "text/csv" }], body: "a,b\n1,2" },
        ]);

        expect(text?.contentType).toBe("text/csv");
        expect(text?.example).toBe("a,b\n1,2");
    });

    test("falls back to an error when that is all there is", () => {
        expect(pickSavedResponse([{ code: 500, body: "{}" }])?.status).toBe(500);
    });

    test("has no answer when nothing was saved", () => {
        expect(pickSavedResponse([])).toBeNull();
        expect(pickSavedResponse(undefined)).toBeNull();
    });
});

describe("readPostman", () => {
    const result = readPostman(FLOW_CRAFT);

    test("reads the collection name", () => {
        expect(result.title).toBe("Flow-craft");
    });

    test("reads every request, folders and all", () => {
        expect(result.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).toEqual([
            "GET /programs/list",
            "POST /programs/new",
            "GET /content/list",
            "GET /api/hospital/select/allopdroom",
        ]);
    });

    test("names an endpoint the way the collection did", () => {
        expect(result.endpoints[0].name).toBe("get all programs");
    });

    test("carries the folder through, to become a collection", () => {
        expect(result.endpoints.map((endpoint) => endpoint.tag)).toEqual([
            "program",
            "program",
            "content",
            "",
        ]);
    });

    test("skips nothing in a well-formed collection", () => {
        expect(result.skipped).toEqual([]);
    });

    /**
     * The half of the report a Postman import exists to be honest about. None
     * of these requests was ever saved with a response, so none of these routes
     * has one — and the panel says so rather than letting four working routes
     * read as four imported answers.
     */
    test("says which routes answer with the document's own body", () => {
        expect(result.endpoints.every((endpoint) => !endpoint.fromExample)).toBe(true);
    });

    test("a route with no saved response still answers something", async () => {
        const executed = await executeGraph(result.endpoints[0].graph, context());

        expect(executed.ok).toBe(true);
        expect(executed.ok && JSON.parse(executed.response.body)).toEqual({
            message: "Hello from ToolForge",
        });
    });

    test("reads the request body, for the path pickers", () => {
        expect(result.endpoints[1].declared.body).toEqual({
            data: { Title: "Intro to Node.js", Price: 49.99, Status: "Pending" },
        });
    });

    /** A field the saved request sent is a field the API wanted. */
    test("guards the top-level body fields the request sent", () => {
        expect(
            result.endpoints[1].required.map((field) => `${field.source}.${field.path}`),
        ).toEqual(["body.data"]);
    });

    test("a request that sends nothing gets no guard", () => {
        expect(result.endpoints[0].required).toEqual([]);
        expect(result.endpoints[0].graph.nodes.some((node) => node.kind === "validate")).toBe(
            false,
        );
    });

    test("the switch turns the guard off without touching the declared shape", () => {
        const unguarded = readPostman(FLOW_CRAFT, { enforceRequired: false }).endpoints[1];

        expect(unguarded.required).toEqual([]);
        expect(unguarded.declared.body).toEqual(result.endpoints[1].declared.body);
    });

    /**
     * Executed against the graph that was stored, not against the object the
     * reader returned: a mapper can be right about everything and still lose it
     * one layer down.
     */
    test("a request missing a guarded field is refused, and the 400 names it", async () => {
        const executed = await executeGraph(result.endpoints[1].graph, {
            ...context(),
            request: { ...REQUEST, method: "POST", body: {} },
        });

        expect(executed.ok && executed.response.status).toBe(400);
        expect(executed.ok && JSON.parse(executed.response.body)).toEqual({
            message: "Required fields are missing from the request.",
            missing: ["body.data"],
        });
    });

    test("a request carrying it gets the mocked response", async () => {
        const executed = await executeGraph(result.endpoints[1].graph, {
            ...context(),
            request: { ...REQUEST, method: "POST", body: { data: {} } },
        });

        expect(executed.ok && executed.response.status).toBe(200);
    });

    describe("headers and query keys", () => {
        const gateway = readPostman({
            info: { name: "gateway" },
            item: [
                {
                    name: "create subscription",
                    request: {
                        method: "POST",
                        header: [
                            { key: "channelId", value: "web" },
                            { key: "X-Trace", value: "1", disabled: true },
                            // Postman writes these itself. Guarding one would
                            // refuse every request not made by Postman.
                            { key: "Postman-Token", value: "abc" },
                            { key: "User-Agent", value: "PostmanRuntime/7.0" },
                        ],
                        url: {
                            path: ["api", "subscription"],
                            query: [
                                { key: "dryRun", value: "false" },
                                { key: "verbose", value: "1", disabled: true },
                            ],
                        },
                    },
                    response: [
                        {
                            code: 201,
                            header: [{ key: "Content-Type", value: "application/json" }],
                            body: '{"id":"sub_1"}',
                        },
                    ],
                },
            ],
        }).endpoints[0];

        test("declares the headers the request carried", () => {
            expect(gateway.declared.headers.map((field) => field.name)).toEqual(["channelId"]);
        });

        test("declares the query keys the request carried", () => {
            expect(gateway.declared.query.map((field) => field.name)).toEqual(["dryRun"]);
        });

        test("guards both, and neither the disabled nor the client's own", () => {
            expect(gateway.required.map((field) => `${field.source}.${field.path}`)).toEqual([
                "header.channelId",
                "query.dryRun",
            ]);
        });

        test("takes the status and the body from the saved response", () => {
            expect(gateway.status).toBe(201);
            expect(gateway.fromExample).toBe(true);
        });

        test("the saved response is an editable tree, not one opaque blob", async () => {
            const executed = await executeGraph(gateway.graph, {
                ...context(),
                request: {
                    ...REQUEST,
                    method: "POST",
                    headers: { channelid: "web" },
                    query: { dryRun: "false" },
                },
            });

            expect(executed.ok && executed.response.status).toBe(201);
            expect(executed.ok && (JSON.parse(executed.response.body) as JsonValue)).toEqual({
                id: "sub_1",
            });
        });
    });

    describe("degradation", () => {
        test("refuses something that is not a document", () => {
            expect(readPostman("nope").skipped[0].reason).toBe("not_a_document");
        });

        test("survives a collection with no items", () => {
            expect(readPostman({ info: { name: "empty" }, item: [] }).endpoints).toEqual([]);
        });

        /** Postman allows methods this router cannot serve. */
        test("skips a method that is not one of ours", () => {
            const mixed = readPostman({
                item: [
                    { name: "purge", request: { method: "PURGE", url: { path: ["cache"] } } },
                    { name: "ok", request: { method: "GET", url: { path: ["cache"] } } },
                ],
            });

            expect(mixed.endpoints).toHaveLength(1);
            expect(mixed.skipped).toEqual([{ path: "purge", reason: "unsupported_method" }]);
        });

        test("skips an item with no request", () => {
            expect(
                readPostman({ item: [{ name: "a folder that is not" }] }).skipped[0].reason,
            ).toBe("not_a_request");
        });

        test("reads the string shorthand for a request", () => {
            const shorthand = readPostman({
                item: [{ name: "ping", request: "https://example.com/ping" }],
            });

            expect(shorthand.endpoints[0].method).toBe("GET");
            expect(shorthand.endpoints[0].path).toBe("/ping");
        });

        test("keeps the rest when one path is unusable", () => {
            const mixed = readPostman({
                item: [
                    { name: "bad", request: { method: "GET", url: { path: ["a b c"] } } },
                    { name: "good", request: { method: "GET", url: { path: ["ok"] } } },
                ],
            });

            expect(mixed.endpoints).toHaveLength(1);
            expect(mixed.skipped).toHaveLength(1);
        });

        /** A folder inside a folder inside a folder is ordinary. */
        test("walks nested folders", () => {
            const nested = readPostman({
                item: [
                    {
                        name: "outer",
                        item: [
                            {
                                name: "inner",
                                item: [
                                    {
                                        name: "deep",
                                        request: { method: "GET", url: { path: ["deep"] } },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });

            expect(nested.endpoints[0].tag).toBe("inner");
            expect(nested.endpoints[0].path).toBe("/deep");
        });
    });
});
