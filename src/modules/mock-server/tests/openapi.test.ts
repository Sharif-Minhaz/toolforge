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
