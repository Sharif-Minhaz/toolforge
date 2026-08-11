import { describe, expect, test } from "bun:test";

import { executeGraph } from "@/modules/mock-server/domain/execute";
import {
    exampleFromSchema,
    pickResponse,
    readOpenApi,
    toRoutePattern,
    writeOpenApi,
} from "@/modules/mock-server/domain/openapi";
import type {
    ExecutionContext,
    JsonValue,
    NormalizedRequest,
} from "@/modules/mock-server/types/graph";

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

const PETSTORE = {
    openapi: "3.0.0",
    info: { title: "Petstore", version: "1.0.0" },
    paths: {
        "/pets": {
            get: {
                operationId: "listPets",
                tags: ["pets"],
                responses: {
                    "200": {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "integer" },
                                            name: { type: "string" },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                operationId: "createPet",
                tags: ["pets"],
                responses: {
                    "201": { content: { "application/json": { schema: { type: "object" } } } },
                },
            },
        },
        "/pets/{petId}": {
            get: {
                operationId: "showPetById",
                tags: ["pets"],
                responses: {
                    "200": {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        id: { type: "integer" },
                                        name: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                    "404": { description: "Not found" },
                },
            },
        },
    },
};

describe("toRoutePattern", () => {
    /** Getting this wrong makes endpoints that look right and match nothing. */
    test("rewrites a brace parameter to a colon one", () => {
        expect(toRoutePattern("/pets/{petId}")).toBe("/pets/:petId");
    });

    test("rewrites several", () => {
        expect(toRoutePattern("/orgs/{org}/repos/{repo}")).toBe("/orgs/:org/repos/:repo");
    });

    test("leaves a static path alone", () => {
        expect(toRoutePattern("/health")).toBe("/health");
    });

    /** Rather than failing the whole import over one path. */
    test("rewrites a name this router would not accept", () => {
        expect(toRoutePattern("/x/{pet-id}")).toBe("/x/:pet_id");
    });
});

describe("exampleFromSchema", () => {
    /** An author's own sample beats anything derived from the type. */
    test("prefers an explicit example", () => {
        expect(exampleFromSchema({ type: "string", example: "Fluffy" })).toBe("Fluffy");
    });

    test("falls back to a default", () => {
        expect(exampleFromSchema({ type: "integer", default: 7 })).toBe(7);
    });

    test("uses the first enum value", () => {
        expect(exampleFromSchema({ type: "string", enum: ["a", "b"] })).toBe("a");
    });

    test("builds an object from its properties", () => {
        expect(
            exampleFromSchema({
                type: "object",
                properties: { id: { type: "integer" }, name: { type: "string" } },
            }),
        ).toEqual({ id: 0, name: "string" });
    });

    test("builds an array of its item type", () => {
        expect(exampleFromSchema({ type: "array", items: { type: "boolean" } })).toEqual([
            true,
            true,
        ]);
    });

    test("shapes a string by its format", () => {
        expect(exampleFromSchema({ type: "string", format: "email" })).toBe("user@example.com");
        expect(exampleFromSchema({ type: "string", format: "date" })).toBe("2026-01-01");
        expect(exampleFromSchema({ type: "string", format: "uuid" })).toMatch(/^[0-9a-f-]{36}$/);
    });

    /** Merged, because that is the only reading with every required field in it. */
    test("merges allOf", () => {
        expect(
            exampleFromSchema({
                allOf: [
                    { type: "object", properties: { a: { type: "integer" } } },
                    { type: "object", properties: { b: { type: "string" } } },
                ],
            }),
        ).toEqual({ a: 0, b: "string" });
    });

    test("takes the first branch of oneOf", () => {
        expect(exampleFromSchema({ oneOf: [{ type: "integer" }, { type: "string" }] })).toBe(0);
    });

    test("treats a schema with properties and no type as an object", () => {
        expect(exampleFromSchema({ properties: { a: { type: "boolean" } } })).toEqual({ a: true });
    });

    /** A `User` with `friends: User[]` is ordinary and would recurse forever. */
    test("terminates a self-referential schema rather than recursing forever", () => {
        const user: Record<string, unknown> = { type: "object", properties: {} };
        (user.properties as Record<string, unknown>).friends = { type: "array", items: user };

        expect(() => exampleFromSchema(user)).not.toThrow();
    });

    test("anything unrecognised becomes null rather than failing", () => {
        expect(exampleFromSchema(null)).toBeNull();
        expect(exampleFromSchema(42)).toBeNull();
    });
});

describe("pickResponse", () => {
    /** Picking document order would return a 404 example for a working call. */
    test("prefers the lowest 2xx over an error listed first", () => {
        expect(
            pickResponse({
                "404": { description: "no" },
                "200": { description: "yes" },
            }).status,
        ).toBe(200);
    });

    test("takes a 201 when there is no 200", () => {
        expect(pickResponse({ "201": {}, "400": {} }).status).toBe(201);
    });

    test("falls back to the only code there is", () => {
        expect(pickResponse({ "404": {} }).status).toBe(404);
    });

    test("defaults to 200 for a document with no responses", () => {
        expect(pickResponse(undefined).status).toBe(200);
    });

    test("prefers a JSON media type", () => {
        const picked = pickResponse({
            "200": {
                content: {
                    "text/plain": { schema: { type: "string" } },
                    "application/json": { schema: { type: "object" } },
                },
            },
        });

        expect(picked.contentType).toBe("application/json");
    });
});

describe("readOpenApi", () => {
    const result = readOpenApi(PETSTORE);

    test("reads the document title", () => {
        expect(result.title).toBe("Petstore");
    });

    test("reads every operation", () => {
        expect(result.endpoints).toHaveLength(3);
    });

    test("reads methods and paths in this router's spelling", () => {
        expect(result.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).toEqual([
            "GET /pets",
            "POST /pets",
            "GET /pets/:petId",
        ]);
    });

    test("names an endpoint by its operationId", () => {
        expect(result.endpoints[0].name).toBe("listPets");
    });

    test("carries the first tag through, to become a collection", () => {
        expect(result.endpoints[0].tag).toBe("pets");
    });

    test("carries the status code through", () => {
        expect(result.endpoints[1].status).toBe(201);
    });

    test("skips nothing in a well-formed document", () => {
        expect(result.skipped).toEqual([]);
    });

    /**
     * The graph is real, so an imported endpoint answers immediately — and the
     * Response Builder can open it and edit it field by field.
     */
    test("produces a graph that executes", async () => {
        const executed = await executeGraph(result.endpoints[0].graph, context());

        expect(executed.ok).toBe(true);
        expect(executed.ok && JSON.parse(executed.response.body)).toEqual([
            { id: 0, name: "string" },
            { id: 0, name: "string" },
        ]);
    });

    test("the body is an editable tree, not one opaque blob", () => {
        const response = result.endpoints[2].graph.nodes.find((node) => node.kind === "response");

        expect(response?.kind === "response" && response.data.body.kind).toBe("object");
    });

    describe("degradation", () => {
        test("refuses something that is not a document", () => {
            expect(readOpenApi("nope").skipped[0].reason).toBe("not_a_document");
        });

        test("survives a document with no paths", () => {
            expect(readOpenApi({ openapi: "3.0.0" }).endpoints).toEqual([]);
        });

        /** 397 endpoints and a list beats an error. */
        test("skips an unusable path and keeps the rest", () => {
            const mixed = readOpenApi({
                paths: {
                    "/ok": { get: { responses: {} } },
                    "/bad/{a}/*/{b}": { get: { responses: {} } },
                },
            });

            expect(mixed.endpoints).toHaveLength(1);
            expect(mixed.skipped).toHaveLength(1);
        });

        test("ignores a path item that is not an object", () => {
            expect(readOpenApi({ paths: { "/x": "nope" } }).skipped[0].reason).toBe(
                "not_an_object",
            );
        });

        test("ignores keys that are not HTTP methods", () => {
            const parsed = readOpenApi({
                paths: { "/x": { get: { responses: {} }, summary: "not a method" } },
            });

            expect(parsed.endpoints).toHaveLength(1);
        });
    });
});

/**
 * The request half of an operation, which the importer used to read and drop.
 *
 * Modelled on bKash's recurring-payment gateway, which is the example the panel
 * ships: three required headers on every call, a required body with required
 * fields inside it, and a required query parameter on the cancel.
 */
const GATEWAY = {
    openapi: "3.0.1",
    info: { title: "gateway", version: "1" },
    paths: {
        "/api/subscription": {
            // Declared on the path item, which is how a document says "every
            // operation here". Reading only the operation's own list misses it.
            parameters: [
                { name: "version", in: "header", required: true, schema: { type: "string" } },
                { name: "channelId", in: "header", required: true, schema: { type: "string" } },
            ],
            post: {
                operationId: "create",
                parameters: [
                    { name: "trace", in: "header", required: false, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["currency", "payerType"],
                                properties: {
                                    currency: { type: "string", enum: ["BDT"] },
                                    payerType: { type: "string", enum: ["CUSTOMER"] },
                                    amount: { type: "number" },
                                },
                            },
                        },
                    },
                },
                responses: { "200": { content: { "application/json": { schema: {} } } } },
            },
        },
        "/api/subscriptions/{id}": {
            delete: {
                operationId: "cancel",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "reason", in: "query", required: true, schema: { type: "string" } },
                ],
                responses: { "200": {} },
            },
        },
    },
};

function guardOf(graph: { nodes: readonly { kind: string; data: unknown }[] }) {
    return graph.nodes.find((node) => node.kind === "validate");
}

describe("readOpenApi: the request half", () => {
    const result = readOpenApi(GATEWAY);
    const create = result.endpoints[0];
    const cancel = result.endpoints[1];

    test("merges the path item's parameters into every operation on it", () => {
        expect(create.declared.headers.map((field) => field.name)).toEqual([
            "version",
            "channelId",
            "trace",
        ]);
    });

    test("keeps optional apart from required", () => {
        expect(create.declared.headers.map((field) => field.required)).toEqual([true, true, false]);
    });

    test("carries an example of the request body, for the path pickers", () => {
        expect(create.declared.body).toEqual({
            currency: "BDT",
            payerType: "CUSTOMER",
            amount: 0,
        });
    });

    test("guards the required headers and the required body fields", () => {
        expect(create.required.map((field) => `${field.source}.${field.path}`)).toEqual([
            "header.version",
            "header.channelId",
            "body.currency",
            "body.payerType",
        ]);
    });

    test("guards a required query parameter", () => {
        expect(cancel.required.map((field) => `${field.source}.${field.path}`)).toEqual([
            "query.reason",
        ]);
    });

    /** A request that reached this route already has them; a check can only pass. */
    test("never guards a path parameter", () => {
        expect(cancel.required.some((field) => field.source === "param")).toBe(false);
    });

    test("writes the declared shape onto the entry node", () => {
        const entry = create.graph.nodes.find((node) => node.kind === "request");

        expect(entry?.data).toEqual({ declared: create.declared });
    });

    test("an operation that requires nothing gets no guard", () => {
        const plain = readOpenApi(PETSTORE).endpoints[0];

        expect(plain.required).toEqual([]);
        expect(guardOf(plain.graph)).toBeUndefined();
        expect(plain.graph.nodes.filter((node) => node.kind === "response")).toHaveLength(1);
    });

    test("the switch turns the guard off without touching anything else", () => {
        const unguarded = readOpenApi(GATEWAY, { enforceRequired: false }).endpoints[0];

        expect(unguarded.required).toEqual([]);
        expect(guardOf(unguarded.graph)).toBeUndefined();
        // The shape is still read: what the switch turns off is enforcement,
        // not the half of the document the pickers use.
        expect(unguarded.declared.headers).toHaveLength(3);
    });

    /**
     * The whole point of the node. A caller who forgot two headers should be
     * told about two headers, in the response body, not just that something was
     * wrong.
     */
    test("a request missing required fields is refused, and the 400 names them", async () => {
        const executed = await executeGraph(create.graph, {
            ...context(),
            request: { ...REQUEST, method: "POST", headers: { version: "1" }, body: {} },
        });

        expect(executed.ok).toBe(true);
        expect(executed.ok && executed.response.status).toBe(400);
        expect(executed.ok && JSON.parse(executed.response.body)).toEqual({
            message: "Required fields are missing from the request.",
            missing: ["header.channelId", "body.currency", "body.payerType"],
        });
    });

    test("a request carrying all of them gets the documented response", async () => {
        const executed = await executeGraph(create.graph, {
            ...context(),
            request: {
                ...REQUEST,
                method: "POST",
                headers: { version: "1", channelid: "web" },
                body: { currency: "BDT", payerType: "CUSTOMER" },
            },
        });

        expect(executed.ok && executed.response.status).toBe(200);
    });

    /** HTTP says header names are case-insensitive; the document's spelling is not law. */
    test("matches a header whatever case it arrived in", async () => {
        const executed = await executeGraph(create.graph, {
            ...context(),
            request: {
                ...REQUEST,
                method: "POST",
                headers: { VERSION: "1", ChannelId: "web" },
                body: { currency: "BDT", payerType: "CUSTOMER" },
            },
        });

        expect(executed.ok && executed.response.status).toBe(200);
    });

    /**
     * A schema's `required` describes the body *if one is sent*. An operation
     * whose body is optional is not asking for those fields on a call with none.
     */
    test("does not guard body fields when the body itself is optional", () => {
        const optional = readOpenApi({
            paths: {
                "/x": {
                    post: {
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: { type: "object", required: ["a"] },
                                },
                            },
                        },
                        responses: { "200": {} },
                    },
                },
            },
        }).endpoints[0];

        expect(optional.required).toEqual([]);
    });

    test("ignores a parameter with no name or an unknown location", () => {
        const odd = readOpenApi({
            paths: {
                "/x": {
                    get: {
                        parameters: [
                            { name: "", in: "header", required: true },
                            { name: "a", in: "nowhere", required: true },
                            { in: "query", required: true },
                        ],
                        responses: { "200": {} },
                    },
                },
            },
        }).endpoints[0];

        expect(odd.required).toEqual([]);
        expect(odd.declared.headers).toEqual([]);
        expect(odd.declared.query).toEqual([]);
    });
});

describe("writeOpenApi", () => {
    const document = writeOpenApi("My API", "https://example.com/m/key", [
        {
            method: "GET",
            path: "/pets/:petId",
            name: "showPetById",
            status: 200,
            contentType: "application/json",
            example: { id: 1 },
        },
    ]) as Record<string, JsonValue>;

    test("declares an OpenAPI version", () => {
        expect(document.openapi).toBe("3.1.0");
    });

    test("names the server's public address", () => {
        expect(document.servers).toEqual([{ url: "https://example.com/m/key" }]);
    });

    /** Back to OpenAPI's spelling on the way out. */
    test("writes a parameter in braces", () => {
        expect(Object.keys(document.paths as object)).toEqual(["/pets/{petId}"]);
    });

    test("declares the path parameter", () => {
        const paths = document.paths as Record<string, Record<string, Record<string, JsonValue>>>;

        expect(paths["/pets/{petId}"].get.parameters).toEqual([
            { name: "petId", in: "path", required: true, schema: { type: "string" } },
        ]);
    });

    /**
     * An example, never a schema. A value tree may generate a different shape
     * per call, so a schema derived from one sample would be a confident claim
     * about a contract nobody made.
     */
    test("carries an example rather than a schema", () => {
        const paths = document.paths as Record<string, Record<string, Record<string, JsonValue>>>;
        const responses = paths["/pets/{petId}"].get.responses as Record<
            string,
            { content: Record<string, Record<string, JsonValue>> }
        >;

        expect(responses["200"].content["application/json"].example).toEqual({ id: 1 });
        expect(responses["200"].content["application/json"].schema).toBeUndefined();
    });

    test("round-trips a path through import and export", () => {
        const reimported = readOpenApi(document);

        expect(reimported.endpoints[0].path).toBe("/pets/:petId");
    });
});

describe("the QUERY method in an exported document", () => {
    /**
     * `query` became a path-item field in OpenAPI 3.2, alongside the IETF
     * standardising the method as RFC 10008. Writing `query:` into a document
     * that calls itself 3.1 produces something validators reject.
     */
    test("declares 3.2 when a QUERY operation is in it", () => {
        const document = writeOpenApi("Search", "https://example.com/m/k", [
            {
                method: "QUERY",
                path: "/search",
                name: "search",
                status: 200,
                contentType: "application/json",
                example: { hits: [] },
            },
        ]) as Record<string, JsonValue>;

        expect(document.openapi).toBe("3.2.0");
    });

    test("writes it as the path item's query field", () => {
        const document = writeOpenApi("Search", "https://example.com/m/k", [
            {
                method: "QUERY",
                path: "/search",
                name: "search",
                status: 200,
                contentType: "application/json",
                example: null,
            },
        ]) as Record<string, JsonValue>;
        const paths = document.paths as Record<string, Record<string, JsonValue>>;

        expect(Object.keys(paths["/search"])).toEqual(["query"]);
    });

    /** A server with no QUERY route gains nothing from a newer version. */
    test("stays on 3.1 when there is no QUERY operation", () => {
        const document = writeOpenApi("Pets", "https://example.com/m/k", [
            {
                method: "GET",
                path: "/pets",
                name: "listPets",
                status: 200,
                contentType: "application/json",
                example: [],
            },
        ]) as Record<string, JsonValue>;

        expect(document.openapi).toBe("3.1.0");
    });

    test("reads a QUERY operation back out of a document", () => {
        const parsed = readOpenApi({
            openapi: "3.2.0",
            paths: { "/search": { query: { operationId: "search", responses: {} } } },
        });

        expect(parsed.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).toEqual([
            "QUERY /search",
        ]);
    });
});
