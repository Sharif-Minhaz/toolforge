import { describe, expect, test } from "bun:test";

import {
    MAX_ARRAY_ITEMS,
    MAX_EXECUTION_STEPS,
    MAX_RESPONSE_BYTES,
} from "@/modules/mock-server/domain/constants";
import { executeGraph, withoutBody } from "@/modules/mock-server/domain/execute";
import { createDefaultGraph, validateGraph } from "@/modules/mock-server/domain/graph";
import type {
    ExecutionContext,
    GraphDocument,
    JsonValue,
    NormalizedRequest,
    ValueExpr,
} from "@/modules/mock-server/types/graph";

const REQUEST: NormalizedRequest = {
    method: "GET",
    path: "/users/42",
    params: { id: "42" },
    query: {},
    headers: {},
    cookies: {},
    body: null,
};

/**
 * A frozen clock and a fixed random source. Every source of nondeterminism in
 * the executor is a parameter, which is what makes the reproducibility
 * invariant below assertable rather than hoped for.
 */
function context(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
    let ticks = 0;

    return {
        request: REQUEST,
        env: {},
        clock: () => ticks++,
        now: () => Date.parse("2026-08-05T09:00:00.000Z"),
        // Resolves instantly: a delay's duration is computed purely, so no test
        // ever waits for real time.
        sleep: async () => {},
        random: () => 0.5,
        deadlineAt: Number.MAX_SAFE_INTEGER,
        vars: {},
        ...overrides,
    };
}

function graphWithBody(body: ValueExpr, contentType = "application/json"): GraphDocument {
    const base = createDefaultGraph();

    return {
        ...base,
        nodes: base.nodes.map((node) =>
            node.kind === "response"
                ? { ...node, data: { ...node.data, body, contentType } }
                : node,
        ),
    };
}

/** Runs a graph and returns its body, or throws with the reason it refused. */
async function bodyOf(graph: unknown, ctx = context()): Promise<string> {
    const result = await executeGraph(graph, ctx);

    if (!result.ok) {
        throw new Error(`expected a response, got ${result.reason}`);
    }

    return result.response.body;
}

describe("the default graph", () => {
    test("validates", async () => {
        expect(validateGraph(createDefaultGraph()).ok).toBe(true);
    });

    test("answers 200", async () => {
        const result = await executeGraph(createDefaultGraph(), context());

        expect(result.ok && result.response.status).toBe(200);
    });

    test("answers with the body it was built around", async () => {
        expect(await bodyOf(createDefaultGraph({ a: 1 }), context())).toBe('{"a":1}');
    });

    test("carries a JSON content type", async () => {
        const result = await executeGraph(createDefaultGraph(), context());
        const header = result.ok
            ? result.response.headers.find((row) => row.name === "content-type")
            : undefined;

        expect(header?.value).toBe("application/json; charset=utf-8");
    });

    test("traces both nodes in order", async () => {
        const result = await executeGraph(createDefaultGraph(), context());

        expect(result.trace.map((entry) => entry.kind)).toEqual(["request", "response"]);
    });
});

describe("serialising a body", () => {
    test("writes an object as JSON", async () => {
        expect(
            await bodyOf(graphWithBody({ kind: "static", value: { a: [1, 2] } }), context()),
        ).toBe('{"a":[1,2]}');
    });

    test("writes null rather than an empty body", async () => {
        expect(await bodyOf(graphWithBody({ kind: "static", value: null }), context())).toBe(
            "null",
        );
    });

    /** `"hello"` with the quotes is not what anybody means by plain text. */
    test("writes a string under text/plain without quoting it", async () => {
        const graph = graphWithBody({ kind: "static", value: "hello" }, "text/plain");

        expect(await bodyOf(graph, context())).toBe("hello");
    });

    test("writes a string under application/json with quotes", async () => {
        const graph = graphWithBody({ kind: "static", value: "hello" });

        expect(await bodyOf(graph, context())).toBe('"hello"');
    });

    /** Outside the allowlist collapses to text/plain rather than being served. */
    test("refuses to claim an executable content type", async () => {
        const graph = graphWithBody({ kind: "static", value: "<h1>hi</h1>" }, "text/html");
        const result = await executeGraph(graph, context());
        const header = result.ok
            ? result.response.headers.find((row) => row.name === "content-type")
            : undefined;

        expect(header?.value).toBe("text/plain; charset=utf-8");
    });
});

describe("composed values", () => {
    test("resolves a nested object", async () => {
        const body: ValueExpr = {
            kind: "object",
            fields: [
                { key: "id", value: { kind: "static", value: 1 } },
                {
                    key: "profile",
                    value: {
                        kind: "object",
                        fields: [{ key: "city", value: { kind: "static", value: "Dhaka" } }],
                    },
                },
            ],
        };

        expect(await bodyOf(graphWithBody(body), context())).toBe(
            '{"id":1,"profile":{"city":"Dhaka"}}',
        );
    });

    test("resolves an array of a fixed length", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: "x" },
            count: { kind: "fixed", n: 3 },
        };

        expect(await bodyOf(graphWithBody(body), context())).toBe('["x","x","x"]');
    });

    test("a zero count is an empty array, not a refusal", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: "x" },
            count: { kind: "fixed", n: 0 },
        };

        expect(await bodyOf(graphWithBody(body), context())).toBe("[]");
    });

    test("a negative count clamps to empty", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: "x" },
            count: { kind: "fixed", n: -5 },
        };

        expect(await bodyOf(graphWithBody(body), context())).toBe("[]");
    });

    /** One number must never become unbounded work. */
    test("clamps a count past the item ceiling", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: 0 },
            count: { kind: "fixed", n: MAX_ARRAY_ITEMS * 10 },
        };
        const parsed = JSON.parse(await bodyOf(graphWithBody(body), context())) as JsonValue[];

        expect(parsed).toHaveLength(MAX_ARRAY_ITEMS);
    });

    test("draws a ranged count from the injected source", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: 0 },
            count: { kind: "range", min: 2, max: 10 },
        };
        const parsed = JSON.parse(
            await bodyOf(graphWithBody(body), context({ random: () => 0 })),
        ) as JsonValue[];

        expect(parsed).toHaveLength(2);
    });

    test("a range whose max is below its min collapses to the min", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: 0 },
            count: { kind: "range", min: 4, max: 1 },
        };
        const parsed = JSON.parse(await bodyOf(graphWithBody(body), context())) as JsonValue[];

        expect(parsed).toHaveLength(4);
    });
});

describe("reproducibility", () => {
    /**
     * The invariant the whole injected-context design exists for. Two runs of
     * one graph over one request with one random source must be byte-identical.
     */
    test("the same graph, request and random source give identical bytes", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: "x" },
            count: { kind: "range", min: 1, max: 9 },
        };
        const graph = graphWithBody(body);

        expect(await bodyOf(graph, context({ random: () => 0.25 }))).toBe(
            await bodyOf(graph, context({ random: () => 0.25 })),
        );
    });

    test("a different random source can give different bytes", async () => {
        const body: ValueExpr = {
            kind: "array",
            of: { kind: "static", value: "x" },
            count: { kind: "range", min: 1, max: 9 },
        };
        const graph = graphWithBody(body);

        expect(await bodyOf(graph, context({ random: () => 0 }))).not.toBe(
            await bodyOf(graph, context({ random: () => 0.99 })),
        );
    });

    test("nothing in the executor reads the wall clock", async () => {
        // A clock that never advances must not change the outcome.
        const frozen = await executeGraph(createDefaultGraph(), context({ clock: () => 0 }));

        expect(frozen.ok).toBe(true);
    });
});

describe("budgets and refusals", () => {
    test("refuses a document that is not a graph", async () => {
        expect(await executeGraph("nonsense", context())).toMatchObject({
            reason: "graph_invalid",
        });
    });

    test("refuses a graph from a schema version it cannot read", async () => {
        expect(
            await executeGraph({ schemaVersion: 99, nodes: [], edges: [] }, context()),
        ).toMatchObject({
            reason: "graph_invalid",
        });
    });

    test("refuses a graph with no entry node", async () => {
        expect(
            await executeGraph({ schemaVersion: 1, nodes: [], edges: [] }, context()),
        ).toMatchObject({
            reason: "no_entry_node",
        });
    });

    test("refuses a path that runs out of edges before a response", async () => {
        const graph = {
            schemaVersion: 1,
            nodes: [{ id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} }],
            edges: [],
        };

        expect(await executeGraph(graph, context())).toMatchObject({
            reason: "no_response_on_path",
        });
    });

    /**
     * Every declared value kind resolves as of M2, so what is left unresolvable
     * is a `faker` with no provider injected — which is exactly the state a
     * context built without the server-only adapter is in.
     */
    test("refuses a faker value when no provider was injected", async () => {
        const graph = graphWithBody({ kind: "faker", fn: "personFullName" });

        expect(await executeGraph(graph, context())).toMatchObject({ reason: "unsupported_value" });
    });

    test("resolves a uuid value, which M2 added", async () => {
        const result = await executeGraph(graphWithBody({ kind: "uuid" }), context());

        expect(result.ok).toBe(true);
    });

    /**
     * `transform` is declared and deliberately unimplemented — everything it
     * was sketched with is already expressible in the Response Builder. It is
     * what "declared but not runnable" looks like now that the logic nodes run.
     */
    test("refuses a node kind this build cannot run", async () => {
        const graph = {
            schemaVersion: 1,
            nodes: [
                { id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} },
                { id: "d", kind: "transform", position: { x: 0, y: 0 }, data: {} },
            ],
            edges: [{ id: "e", source: "r", sourceHandle: "next", target: "d" }],
        };

        expect(await executeGraph(graph, context())).toMatchObject({ reason: "unsupported_node" });
    });

    /** A cycle is rejected at save; this is the backstop for a row that
     * predates the rule. */
    test("stops a cycle at the step budget rather than spinning", async () => {
        const graph = {
            schemaVersion: 1,
            nodes: [
                { id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} },
                { id: "b", kind: "request", position: { x: 0, y: 0 }, data: {} },
            ],
            edges: [
                { id: "e1", source: "r", sourceHandle: "next", target: "b" },
                { id: "e2", source: "b", sourceHandle: "next", target: "r" },
            ],
        };
        const result = await executeGraph(graph, context());

        expect(result).toMatchObject({ reason: "step_budget_exceeded" });
        expect(result.trace).toHaveLength(MAX_EXECUTION_STEPS);
    });

    test("stops at the deadline", async () => {
        const graph = createDefaultGraph();
        const result = await executeGraph(
            graph,
            context({ clock: () => 5_000, deadlineAt: 1_000 }),
        );

        expect(result).toMatchObject({ reason: "deadline_exceeded" });
    });

    test("refuses a response past the size ceiling", async () => {
        const graph = graphWithBody({
            kind: "static",
            value: "x".repeat(MAX_RESPONSE_BYTES + 1),
        });

        expect(await executeGraph(graph, context())).toMatchObject({
            reason: "response_too_large",
        });
    });

    /** Measured in bytes, not characters — one emoji is four. */
    test("measures the ceiling in bytes rather than characters", async () => {
        const graph = graphWithBody({
            kind: "static",
            value: "🚀".repeat(MAX_RESPONSE_BYTES / 2),
        });

        expect(await executeGraph(graph, context())).toMatchObject({
            reason: "response_too_large",
        });
    });
});

describe("withoutBody", () => {
    test("keeps every header and drops the bytes", async () => {
        const result = await executeGraph(createDefaultGraph(), context());

        if (!result.ok) {
            throw new Error("expected a response");
        }

        const head = withoutBody(result.response);

        expect(head.body).toBe("");
        expect(head.headers).toEqual(result.response.headers);
        expect(head.status).toBe(result.response.status);
    });
});
