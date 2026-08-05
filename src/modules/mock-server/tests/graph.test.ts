import { describe, expect, test } from "bun:test";

import {
    ALLOWED_CONTENT_TYPES,
    baseType,
    isAllowedContentType,
    isJsonType,
    resolveContentType,
} from "@/modules/mock-server/domain/content-type";
import { createDefaultGraph, readGraph, validateGraph } from "@/modules/mock-server/domain/graph";
import { addNode, connect } from "@/modules/mock-server/domain/graph-edit";
import {
    handlesFor,
    nodeDefinition,
    placeableNodeKinds,
} from "@/modules/mock-server/domain/node-registry";
import { NODE_KINDS } from "@/modules/mock-server/types/graph";
import type { GraphProblemReason } from "@/modules/mock-server/types/graph";

function reasons(raw: unknown): readonly GraphProblemReason[] {
    const result = validateGraph(raw);

    return result.ok ? [] : result.problems.map((problem) => problem.reason);
}

const REQUEST_NODE = { id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} };

function responseNode(overrides: Record<string, unknown> = {}) {
    return {
        id: "resp",
        kind: "response",
        position: { x: 0, y: 0 },
        data: {
            status: 200,
            contentType: "application/json",
            headers: [],
            body: { kind: "static", value: {} },
            ...overrides,
        },
    };
}

const EDGE = { id: "e", source: "r", sourceHandle: "next", target: "resp" };

describe("readGraph", () => {
    test("reads a document it wrote", () => {
        expect(readGraph(createDefaultGraph()).ok).toBe(true);
    });

    test("refuses a string", () => {
        expect(readGraph("hello")).toEqual({ ok: false, reason: "not_a_document" });
    });

    test("refuses null", () => {
        expect(readGraph(null)).toEqual({ ok: false, reason: "not_a_document" });
    });

    test("refuses an array", () => {
        expect(readGraph([])).toEqual({ ok: false, reason: "not_a_document" });
    });

    test("refuses a schema version it does not know", () => {
        expect(readGraph({ schemaVersion: 2, nodes: [], edges: [] })).toEqual({
            ok: false,
            reason: "unknown_schema_version",
        });
    });

    /**
     * A graph missing one node still renders and still explains itself; a page
     * that refuses to load explains nothing.
     */
    test("drops an unreadable node rather than failing the document", () => {
        const result = readGraph({
            schemaVersion: 1,
            nodes: [REQUEST_NODE, { id: 7 }, { kind: "response" }],
            edges: [],
        });

        expect(result.ok && result.graph.nodes).toHaveLength(1);
    });

    test("drops a node of an unknown kind", () => {
        const result = readGraph({
            schemaVersion: 1,
            nodes: [REQUEST_NODE, { id: "x", kind: "teleport", position: {}, data: {} }],
            edges: [],
        });

        expect(result.ok && result.graph.nodes).toHaveLength(1);
    });

    test("drops an unreadable edge", () => {
        const result = readGraph({
            schemaVersion: 1,
            nodes: [REQUEST_NODE],
            edges: [{ id: "e" }, EDGE],
        });

        expect(result.ok && result.graph.edges).toHaveLength(1);
    });

    test("supplies a default handle for an edge that omits one", () => {
        const result = readGraph({
            schemaVersion: 1,
            nodes: [REQUEST_NODE],
            edges: [{ id: "e", source: "r", target: "resp" }],
        });

        expect(result.ok && result.graph.edges[0].sourceHandle).toBe("next");
    });

    test("supplies an origin for a node with no position", () => {
        const result = readGraph({
            schemaVersion: 1,
            nodes: [{ id: "r", kind: "request", data: {} }],
            edges: [],
        });

        expect(result.ok && result.graph.nodes[0].position).toEqual({ x: 0, y: 0 });
    });

    test("survives missing node and edge arrays entirely", () => {
        expect(readGraph({ schemaVersion: 1 })).toMatchObject({ ok: true });
    });
});

describe("validateGraph", () => {
    test("accepts the default graph", () => {
        expect(validateGraph(createDefaultGraph()).ok).toBe(true);
    });

    test("reports a missing entry node", () => {
        expect(reasons({ schemaVersion: 1, nodes: [responseNode()], edges: [] })).toContain(
            "no_request_node",
        );
    });

    test("reports two entry nodes", () => {
        expect(
            reasons({
                schemaVersion: 1,
                nodes: [REQUEST_NODE, { ...REQUEST_NODE, id: "r2" }, responseNode()],
                edges: [EDGE],
            }),
        ).toContain("many_request_nodes");
    });

    test("reports a graph with no response at all", () => {
        expect(reasons({ schemaVersion: 1, nodes: [REQUEST_NODE], edges: [] })).toContain(
            "no_response_node",
        );
    });

    /** A path that runs out of edges is an endpoint that would 500 at exactly
     * the moment somebody depended on it. */
    test("reports a path that never reaches a response", () => {
        expect(
            reasons({ schemaVersion: 1, nodes: [REQUEST_NODE, responseNode()], edges: [] }),
        ).toContain("path_without_response");
    });

    test("reports a node nothing can reach", () => {
        const orphan = { ...responseNode(), id: "orphan" };

        expect(
            reasons({
                schemaVersion: 1,
                nodes: [REQUEST_NODE, responseNode(), orphan],
                edges: [EDGE],
            }),
        ).toContain("unreachable_node");
    });

    test("reports a cycle", () => {
        expect(
            reasons({
                schemaVersion: 1,
                nodes: [REQUEST_NODE, responseNode()],
                edges: [EDGE, { id: "back", source: "resp", sourceHandle: "next", target: "r" }],
            }),
        ).toContain("cycle");
    });

    test("reports an edge pointing at a node that is not there", () => {
        expect(
            reasons({
                schemaVersion: 1,
                nodes: [REQUEST_NODE, responseNode()],
                edges: [EDGE, { id: "x", source: "r", sourceHandle: "next", target: "ghost" }],
            }),
        ).toContain("unknown_handle");
    });

    /**
     * `delay` until M4 shipped it. Swapped for `transform`, the one kind that
     * is declared and deliberately unimplemented — a contract change, not a
     * fix: this assertion passed for two milestones only because the validator
     * was asking a list that had stopped being true, and that is the bug the
     * block at the foot of this file exists to prevent coming back.
     */
    test("reports a node kind this build cannot run", () => {
        expect(
            reasons({
                schemaVersion: 1,
                nodes: [
                    REQUEST_NODE,
                    { id: "d", kind: "transform", position: { x: 0, y: 0 }, data: {} },
                    responseNode(),
                ],
                edges: [
                    { id: "e1", source: "r", sourceHandle: "next", target: "d" },
                    { id: "e2", source: "d", sourceHandle: "next", target: "resp" },
                ],
            }),
        ).toContain("unsupported_node");
    });

    test("reports a value kind this build cannot resolve", () => {
        expect(
            reasons({
                schemaVersion: 1,
                nodes: [REQUEST_NODE, responseNode({ body: { kind: "faker", fn: "person.name" } })],
                edges: [EDGE],
            }),
        ).toContain("unsupported_value");
    });

    test("accepts a nested object body", () => {
        const body = {
            kind: "object",
            fields: [
                {
                    key: "a",
                    value: {
                        kind: "array",
                        of: { kind: "static", value: 1 },
                        count: { kind: "fixed", n: 2 },
                    },
                },
            ],
        };

        expect(
            validateGraph({
                schemaVersion: 1,
                nodes: [REQUEST_NODE, responseNode({ body })],
                edges: [EDGE],
            }).ok,
        ).toBe(true);
    });

    describe("status codes", () => {
        for (const status of [99, 600, 0, -1, 200.5, Number.NaN]) {
            test(`reports ${status} as invalid`, () => {
                expect(
                    reasons({
                        schemaVersion: 1,
                        nodes: [REQUEST_NODE, responseNode({ status })],
                        edges: [EDGE],
                    }),
                ).toContain("invalid_status");
            });
        }

        for (const status of [100, 200, 404, 418, 599]) {
            test(`accepts ${status}`, () => {
                expect(
                    validateGraph({
                        schemaVersion: 1,
                        nodes: [REQUEST_NODE, responseNode({ status })],
                        edges: [EDGE],
                    }).ok,
                ).toBe(true);
            });
        }
    });

    /** Every problem in one pass, so one round trip fixes them all. */
    test("reports every problem rather than only the first", () => {
        const found = reasons({
            schemaVersion: 1,
            nodes: [responseNode({ status: 9 })],
            edges: [],
        });

        expect(found).toContain("no_request_node");
        expect(found).toContain("invalid_status");
    });
});

describe("content types", () => {
    test("strips parameters and lower-cases", () => {
        expect(baseType("Application/JSON; charset=UTF-8")).toBe("application/json");
    });

    for (const allowed of ALLOWED_CONTENT_TYPES) {
        test(`allows ${allowed}`, () => {
            expect(isAllowedContentType(allowed)).toBe(true);
        });
    }

    /**
     * The refusal that matters while the studio shares an origin with the rest
     * of the site: an endpoint able to answer text/html is an endpoint able to
     * serve a sign-in page under this site's name.
     */
    test("refuses text/html", () => {
        expect(isAllowedContentType("text/html")).toBe(false);
    });

    test("refuses every script type", () => {
        for (const scripty of [
            "application/javascript",
            "text/javascript",
            "application/ecmascript",
            "image/svg+xml",
        ]) {
            expect(isAllowedContentType(scripty)).toBe(false);
        }
    });

    test("collapses a refused type to text/plain rather than erroring", () => {
        expect(resolveContentType("text/html")).toBe("text/plain; charset=utf-8");
    });

    test("keeps an allowed type and adds a charset", () => {
        expect(resolveContentType("application/json")).toBe("application/json; charset=utf-8");
    });

    test("recognises a JSON body by its suffix", () => {
        expect(isJsonType("application/problem+json")).toBe(true);
    });

    test("does not treat plain text as JSON", () => {
        expect(isJsonType("text/plain")).toBe(false);
    });
});

describe("the body a new route starts with", () => {
    function defaultBody() {
        const response = createDefaultGraph().nodes.find((node) => node.kind === "response");

        return response?.kind === "response" ? response.data.body : null;
    }

    /**
     * The regression: the body was `{ kind: "static", value: { message: … } }`,
     * a single literal whose value happened to be an object. The Response
     * Builder renders exactly what it is told, so it drew kind *Fixed value*
     * with the object stringified into a one-line text box — `[object Object]`
     * — and typing one character there replaced the whole response with the
     * string `[object Objec`. A default nobody can edit without destroying it
     * is worse than no default.
     */
    test("is a tree, not one literal holding an object", () => {
        expect(defaultBody()?.kind).toBe("object");
    });

    test("opens with the field editable rather than stringified", () => {
        const body = defaultBody();

        expect(body?.kind === "object" && body.fields).toEqual([
            { key: "message", value: { kind: "static", value: "Hello from ToolForge" } },
        ]);
    });

    /** Whatever it is handed becomes nodes, not one opaque value. */
    test("a nested default is expanded the whole way down", () => {
        const graph = createDefaultGraph({ user: { id: 1, tags: ["a"] } });
        const response = graph.nodes.find((node) => node.kind === "response");
        const body = response?.kind === "response" ? response.data.body : null;

        expect(body?.kind).toBe("object");

        const user = body?.kind === "object" ? body.fields[0].value : null;

        expect(user?.kind).toBe("object");
        expect(user?.kind === "object" && user.fields.map((field) => field.key)).toEqual([
            "id",
            "tags",
        ]);
    });

    test("a scalar default is still a literal", () => {
        const graph = createDefaultGraph("plain");
        const response = graph.nodes.find((node) => node.kind === "response");
        const body = response?.kind === "response" ? response.data.body : null;

        expect(body).toEqual({ kind: "static", value: "plain" });
    });

    test("the graph it produces still validates", () => {
        expect(validateGraph(createDefaultGraph()).ok).toBe(true);
    });
});

describe("validating a graph the palette can actually build", () => {
    /**
     * The bug: `validateGraph` asked a constant in `types/` whether a node kind
     * could run, and that constant had said "request and response" since M1.
     * M4 through M8 added eight running kinds and updated the registry's flag —
     * the other answer to the same question — so from M4 on **every graph
     * containing a logic node was refused on save**, and refused as
     * `unsupported_node`, which the action then reported as "The response body
     * is not valid JSON".
     *
     * Nothing caught it because the execution tests call `executeGraph`
     * directly and never save. This is the shape that does.
     */
    test("every kind the palette offers passes validation", () => {
        for (const kind of placeableNodeKinds()) {
            let graph = addNode(createDefaultGraph(), kind, { x: 200, y: 200 });
            const added = graph.nodes.at(-1);

            if (added === undefined) {
                throw new Error(`nothing was added for ${kind}`);
            }

            // Wired inline so the node is reachable and every path still ends
            // at a response — otherwise a failure here would be about the
            // wiring rather than about the kind. A terminal node has no
            // outgoing handle to wire, which is the point of being terminal.
            graph = connect(graph, "request", "next", added.id);

            for (const handle of handlesFor(added)) {
                graph = connect(graph, added.id, handle.id, "response");
            }

            const checked = validateGraph(graph);
            const problems = checked.ok ? [] : checked.problems.map((problem) => problem.reason);

            // `transform` is the one kind declared and deliberately not built.
            expect(problems.filter((reason) => reason === "unsupported_node")).toEqual(
                kind === "transform" ? ["unsupported_node"] : [],
            );
        }
    });

    /** The user's report: a condition with a response on each branch. */
    test("a condition with a response on both branches validates", () => {
        let graph = createDefaultGraph();
        graph = addNode(graph, "condition", { x: 200, y: 0 });
        graph = addNode(graph, "response", { x: 600, y: 200 });
        graph = connect(graph, "request", "next", "condition-1");
        graph = connect(graph, "condition-1", "true", "response");
        graph = connect(graph, "condition-1", "false", "response-1");

        expect(validateGraph(graph).ok).toBe(true);
    });

    /**
     * Pinning what validation does *not* catch, so the gap is recorded rather
     * than rediscovered. `path_without_response` fires for a node with no
     * outgoing edges at all; a condition with one branch wired has an edge, so
     * nothing complains — and at runtime the unwired branch reaches no response
     * and answers 500. Closing it means checking every *handle* rather than
     * every node, which would also refuse a half-built flow somebody is still
     * working on. That is a product decision, not an oversight to patch
     * quietly, so this test says what happens today.
     */
    test("an unwired branch is NOT caught — a known gap", () => {
        let graph = createDefaultGraph();
        graph = addNode(graph, "condition", { x: 200, y: 0 });
        graph = connect(graph, "request", "next", "condition-1");
        graph = connect(graph, "condition-1", "true", "response");
        // The false branch is left dangling on purpose.

        expect(validateGraph(graph).ok).toBe(true);
    });

    /**
     * The two answers to "can this run" have to agree, or the palette offers
     * something the save refuses — which is exactly what happened.
     */
    test("the registry is the only thing asked whether a kind runs", () => {
        for (const kind of NODE_KINDS) {
            const graph = addNode(createDefaultGraph(), kind, { x: 0, y: 400 });
            const checked = validateGraph(graph);
            const refused =
                !checked.ok &&
                checked.problems.some((problem) => problem.reason === "unsupported_node");

            expect(refused).toBe(!nodeDefinition(kind).implemented);
        }
    });
});
