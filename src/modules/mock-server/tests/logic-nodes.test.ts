import { describe, expect, test } from "bun:test";

import { checkAuth, type AuthConfig } from "@/modules/mock-server/domain/auth-check";
import { compareValues, pickWeighted, type CompareOp } from "@/modules/mock-server/domain/compare";
import { MAX_DELAY_MS } from "@/modules/mock-server/domain/constants";
import { executeGraph } from "@/modules/mock-server/domain/execute";
import { addNode, connect, emptyGraph, removeNodes } from "@/modules/mock-server/domain/graph-edit";
import { createDefaultGraph } from "@/modules/mock-server/domain/graph";
import { planDelay } from "@/modules/mock-server/domain/nodes";
import { createSeededRandom } from "@/modules/mock-server/domain/seeded-random";
import type {
    ExecutionContext,
    GraphDocument,
    GraphNode,
    NormalizedRequest,
} from "@/modules/mock-server/types/graph";

const REQUEST: NormalizedRequest = {
    method: "POST",
    path: "/login",
    params: {},
    query: {},
    headers: {},
    cookies: {},
    body: { email: "admin@test.com", role: "admin", age: 30 },
};

function context(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
    return {
        request: REQUEST,
        env: {},
        clock: () => 0,
        now: () => 0,
        sleep: async () => {},
        random: () => 0.5,
        deadlineAt: Number.MAX_SAFE_INTEGER,
        vars: {},
        ...overrides,
    };
}

describe("compareValues", () => {
    const cases: readonly [unknown, CompareOp, unknown, boolean][] = [
        ["a", "equals", "a", true],
        ["a", "equals", "b", false],
        ["a", "notEquals", "b", true],
        // Coerced because a path parameter is always a string: refusing this
        // would make `/users/:id` unusable in a condition.
        ["42", "equals", 42, true],
        [42, "equals", "42", true],
        ["42.0", "equals", 42, true],
        /*
         * A reversal, not a fix. This asserted `false` on the argument that a
         * body's string "true" is a different fact from its boolean — which is
         * true, and was the wrong rule to draw from it. A query string has no
         * booleans in it: `?is_stock=true` arrives as text while the operand box
         * coerces a typed `true` to the boolean, so `is_stock equals true` could
         * never hold and no typing on either side could make it. What is given
         * up is telling a body's "true" from its `true`, which is far rarer than
         * comparing a query parameter to a boolean.
         */
        ["true", "equals", true, true],
        ["TRUE", "equals", true, true],
        [" false ", "equals", false, true],
        ["true", "equals", false, false],
        ["false", "notEquals", true, true],
        // Only the literal words. `1 equals true` staying false is the whole
        // reason `asBoolean` does not read numbers — that is JavaScript's
        // mistake and it would make a count of one mean yes.
        [1, "equals", true, false],
        ["1", "equals", true, false],
        [0, "equals", false, false],
        ["yes", "equals", true, false],
        [null, "equals", "", false],
        ["abcdef", "contains", "cde", true],
        ["abcdef", "notContains", "xyz", true],
        ["abcdef", "startsWith", "abc", true],
        ["abcdef", "endsWith", "def", true],
        [10, "greaterThan", 2, true],
        ["10", "greaterThan", "2", true],
        [2, "lessThan", 10, true],
        ["", "exists", null, false],
        ["x", "exists", null, true],
        [null, "notExists", null, true],
        ["", "isEmpty", null, true],
        ["abc", "matches", "^a.c$", true],
        ["abc", "matches", "^z", false],
    ];

    for (const [left, op, right, expected] of cases) {
        test(`${JSON.stringify(left)} ${op} ${JSON.stringify(right)} is ${expected}`, () => {
            expect(compareValues(left as never, op, right as never)).toBe(expected);
        });
    }

    test("compares an object structurally", () => {
        expect(compareValues({ a: 1 } as never, "equals", { a: 1 } as never)).toBe(true);
    });

    test("an array contains an element", () => {
        expect(compareValues(["a", "b"] as never, "contains", "b" as never)).toBe(true);
    });

    test("an empty array is empty", () => {
        expect(compareValues([] as never, "isEmpty", null as never)).toBe(true);
    });

    test("an empty object is empty", () => {
        expect(compareValues({} as never, "isEmpty", null as never)).toBe(true);
    });

    /** A half-typed pattern is not a reason to 500 somebody's mock. */
    test("an invalid pattern is false rather than a thrown error", () => {
        expect(compareValues("abc" as never, "matches", "([" as never)).toBe(false);
    });

    /** Falls back to lexicographic order, which makes it usable on a date. */
    test("greaterThan orders non-numeric operands as text", () => {
        expect(compareValues("2026-08-05" as never, "greaterThan", "2026-01-01" as never)).toBe(
            true,
        );
    });
});

describe("pickWeighted", () => {
    const branches = [
        { id: "a", weight: 80 },
        { id: "b", weight: 20 },
    ];

    test("picks the first branch at the bottom of the range", () => {
        expect(pickWeighted(branches, 0)?.id).toBe("a");
    });

    test("picks the first branch just inside its share", () => {
        expect(pickWeighted(branches, 0.79)?.id).toBe("a");
    });

    test("picks the second branch past the boundary", () => {
        expect(pickWeighted(branches, 0.81)?.id).toBe("b");
    });

    test("stays inside the list at the very top of the range", () => {
        expect(pickWeighted(branches, 1)?.id).toBe("b");
    });

    /** Relative, not percentages: 3 and 1 needs no arithmetic from the reader. */
    test("treats weights as relative rather than as percentages", () => {
        const relative = [
            { id: "a", weight: 3 },
            { id: "b", weight: 1 },
        ];

        expect(pickWeighted(relative, 0.7)?.id).toBe("a");
        expect(pickWeighted(relative, 0.8)?.id).toBe("b");
    });

    test("skips a zero-weight branch entirely", () => {
        const withZero = [
            { id: "a", weight: 0 },
            { id: "b", weight: 1 },
        ];

        expect(pickWeighted(withZero, 0)?.id).toBe("b");
    });

    test("treats a negative weight as zero", () => {
        const negative = [
            { id: "a", weight: -5 },
            { id: "b", weight: 1 },
        ];

        expect(pickWeighted(negative, 0)?.id).toBe("b");
    });

    /** A graph that stops mid-flight is a 500; an arbitrary branch is a reply. */
    test("falls back to the first branch when every weight is zero", () => {
        expect(pickWeighted([{ id: "a", weight: 0 }], 0.5)?.id).toBe("a");
    });

    test("has nothing to pick from an empty list", () => {
        expect(pickWeighted([], 0.5)).toBeUndefined();
    });

    test("distributes roughly as the weights say", () => {
        const random = createSeededRandom("weights");
        let a = 0;

        for (let index = 0; index < 10_000; index += 1) {
            if (pickWeighted(branches, random())?.id === "a") {
                a += 1;
            }
        }

        expect(a).toBeGreaterThan(7_700);
        expect(a).toBeLessThan(8_300);
    });
});

describe("checkAuth", () => {
    function withHeaders(headers: Record<string, string>): NormalizedRequest {
        return { ...REQUEST, headers };
    }

    function config(overrides: Partial<AuthConfig>): AuthConfig {
        return { mode: "none", header: "x-api-key", value: "", ...overrides };
    }

    test("none lets everything through", () => {
        expect(checkAuth(config({ mode: "none" }), withHeaders({}))).toBe(true);
    });

    describe("apiKey", () => {
        test("accepts a matching key", () => {
            expect(
                checkAuth(
                    config({ mode: "apiKey", value: "s3cret" }),
                    withHeaders({ "x-api-key": "s3cret" }),
                ),
            ).toBe(true);
        });

        test("refuses a wrong key", () => {
            expect(
                checkAuth(
                    config({ mode: "apiKey", value: "s3cret" }),
                    withHeaders({ "x-api-key": "nope" }),
                ),
            ).toBe(false);
        });

        test("refuses an absent header", () => {
            expect(checkAuth(config({ mode: "apiKey", value: "s3cret" }), withHeaders({}))).toBe(
                false,
            );
        });

        test("reads the header case-insensitively, as HTTP defines it", () => {
            expect(
                checkAuth(
                    config({ mode: "apiKey", value: "s3cret" }),
                    withHeaders({ "X-API-KEY": "s3cret" }),
                ),
            ).toBe(true);
        });

        /** Blank means "any credential of the right shape" — modelling a 401. */
        test("a blank expectation accepts any non-empty key", () => {
            expect(
                checkAuth(config({ mode: "apiKey" }), withHeaders({ "x-api-key": "anything" })),
            ).toBe(true);
        });

        test("a blank expectation still refuses an empty key", () => {
            expect(checkAuth(config({ mode: "apiKey" }), withHeaders({ "x-api-key": "" }))).toBe(
                false,
            );
        });

        test("honours a custom header name", () => {
            expect(
                checkAuth(
                    config({ mode: "apiKey", header: "x-tenant-key", value: "t1" }),
                    withHeaders({ "x-tenant-key": "t1" }),
                ),
            ).toBe(true);
        });
    });

    describe("bearer", () => {
        test("accepts a matching token", () => {
            expect(
                checkAuth(
                    config({ mode: "bearer", value: "abc" }),
                    withHeaders({ authorization: "Bearer abc" }),
                ),
            ).toBe(true);
        });

        /** RFC 7235 says the scheme is case-insensitive. */
        test("accepts a lower-case scheme", () => {
            expect(
                checkAuth(
                    config({ mode: "bearer", value: "abc" }),
                    withHeaders({ authorization: "bearer abc" }),
                ),
            ).toBe(true);
        });

        test("refuses a Basic header", () => {
            expect(
                checkAuth(config({ mode: "bearer" }), withHeaders({ authorization: "Basic abc" })),
            ).toBe(false);
        });

        test("refuses a bare token with no scheme", () => {
            expect(
                checkAuth(config({ mode: "bearer" }), withHeaders({ authorization: "abc" })),
            ).toBe(false);
        });
    });

    describe("basic", () => {
        const encoded = btoa("ada:hunter2");

        /** Configured as `user:pass`; nobody should base64 a credential by hand. */
        test("compares the decoded credential", () => {
            expect(
                checkAuth(
                    config({ mode: "basic", value: "ada:hunter2" }),
                    withHeaders({ authorization: `Basic ${encoded}` }),
                ),
            ).toBe(true);
        });

        test("refuses the wrong password", () => {
            expect(
                checkAuth(
                    config({ mode: "basic", value: "ada:wrong" }),
                    withHeaders({ authorization: `Basic ${encoded}` }),
                ),
            ).toBe(false);
        });

        /** A malformed header is a 401, not a 500. */
        test("survives a value that is not base64", () => {
            expect(
                checkAuth(
                    config({ mode: "basic", value: "ada:hunter2" }),
                    withHeaders({ authorization: "Basic !!!not-base64!!!" }),
                ),
            ).toBe(false);
        });
    });

    describe("jwt", () => {
        const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig";

        /**
         * Shape only, and the copy says so. There is no identity provider behind
         * a mock, so a signature cannot be verified — claiming otherwise would
         * invite somebody to test an auth flow against a check that accepts
         * anything.
         */
        test("accepts something shaped like a JWT", () => {
            expect(
                checkAuth(
                    config({ mode: "jwt" }),
                    withHeaders({ authorization: `Bearer ${token}` }),
                ),
            ).toBe(true);
        });

        test("refuses a token with too few segments", () => {
            expect(
                checkAuth(
                    config({ mode: "jwt" }),
                    withHeaders({ authorization: "Bearer abc.def" }),
                ),
            ).toBe(false);
        });

        test("accepts an unsigned token, which has an empty third segment", () => {
            expect(
                checkAuth(
                    config({ mode: "jwt" }),
                    withHeaders({ authorization: "Bearer abc.def." }),
                ),
            ).toBe(true);
        });

        test("still honours an exact expected token", () => {
            expect(
                checkAuth(
                    config({ mode: "jwt", value: token }),
                    withHeaders({ authorization: "Bearer other.other.other" }),
                ),
            ).toBe(false);
        });
    });
});

describe("planDelay", () => {
    function delayNode(data: Record<string, number>): GraphNode {
        return { id: "d", kind: "delay", position: { x: 0, y: 0 }, data } as GraphNode;
    }

    test("waits the configured time", () => {
        expect(planDelay(delayNode({ ms: 250 }), context()).ms).toBe(250);
    });

    test("no configuration means no wait", () => {
        expect(planDelay(delayNode({}), context()).ms).toBe(0);
    });

    /** An uncapped delay is a denial of service configurable through a form. */
    test("clamps past the ceiling", () => {
        expect(planDelay(delayNode({ ms: 60_000 }), context()).ms).toBe(MAX_DELAY_MS);
    });

    test("clamps a negative delay to zero", () => {
        expect(planDelay(delayNode({ ms: -100 }), context()).ms).toBe(0);
    });

    test("draws a jittered delay from the injected source", () => {
        expect(planDelay(delayNode({ min: 100, max: 300 }), context({ random: () => 0 })).ms).toBe(
            100,
        );
        expect(
            planDelay(delayNode({ min: 100, max: 300 }), context({ random: () => 0.5 })).ms,
        ).toBe(200);
    });

    test("an inverted range falls back to the fixed value", () => {
        expect(planDelay(delayNode({ min: 300, max: 100, ms: 42 }), context()).ms).toBe(42);
    });
});

describe("executing a branching graph", () => {
    /** request → condition → (true) responseA / (false) responseB */
    function conditional(op: CompareOp, right: string): GraphDocument {
        let graph = removeNodes(createDefaultGraph(), ["response"]);
        graph = addNode(graph, "condition", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });

        graph = {
            ...graph,
            nodes: graph.nodes.map((node) => {
                if (node.id === "condition-1") {
                    return {
                        ...node,
                        data: {
                            left: { kind: "request", source: "body", path: "email" },
                            op,
                            right: { kind: "static", value: right },
                        },
                    } as GraphNode;
                }

                if (node.kind === "response") {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            body: { kind: "static", value: node.id },
                        },
                    } as GraphNode;
                }

                return node;
            }),
        };

        graph = connect(graph, "request", "next", "condition-1");
        graph = connect(graph, "condition-1", "true", "response-1");
        graph = connect(graph, "condition-1", "false", "response-2");

        return graph;
    }

    test("follows the true branch", async () => {
        const result = await executeGraph(conditional("equals", "admin@test.com"), context());

        expect(result.ok && result.response.body).toBe('"response-1"');
    });

    test("follows the false branch", async () => {
        const result = await executeGraph(conditional("equals", "someone@else.com"), context());

        expect(result.ok && result.response.body).toBe('"response-2"');
    });

    test("traces every node it walked, in order", async () => {
        const result = await executeGraph(conditional("equals", "admin@test.com"), context());

        expect(result.trace.map((entry) => entry.kind)).toEqual([
            "request",
            "condition",
            "response",
        ]);
    });

    test("a variable set upstream is readable downstream", async () => {
        let graph = removeNodes(createDefaultGraph(), ["response"]);
        graph = addNode(graph, "setVariable", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });
        graph = {
            ...graph,
            nodes: graph.nodes.map((node) => {
                if (node.id === "setVariable-1") {
                    return {
                        ...node,
                        data: { name: "greeting", value: { kind: "static", value: "hello" } },
                    } as GraphNode;
                }

                if (node.kind === "response") {
                    return {
                        ...node,
                        data: { ...node.data, body: { kind: "var", name: "greeting" } },
                    } as GraphNode;
                }

                return node;
            }),
        };
        graph = connect(graph, "request", "next", "setVariable-1");
        graph = connect(graph, "setVariable-1", "next", "response-1");

        const result = await executeGraph(graph, context());

        expect(result.ok && result.response.body).toBe('"hello"');
    });

    /**
     * Collected into the trace, never written to this deployment's stdout — a
     * visitor's mock must not be able to put arbitrary text into our logs.
     */
    test("a log node's line comes back on the result, not on stdout", async () => {
        let graph = removeNodes(createDefaultGraph(), ["response"]);
        graph = addNode(graph, "log", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });
        graph = {
            ...graph,
            nodes: graph.nodes.map((node) =>
                node.id === "log-1"
                    ? ({
                          ...node,
                          data: { level: "warn", message: { kind: "static", value: "careful" } },
                      } as GraphNode)
                    : node,
            ),
        };
        graph = connect(graph, "request", "next", "log-1");
        graph = connect(graph, "log-1", "next", "response-1");

        const result = await executeGraph(graph, context());

        expect(result.log).toEqual([{ level: "warn", message: "careful" }]);
    });

    test("an auth node refuses down its fail handle", async () => {
        let graph = removeNodes(createDefaultGraph(), ["response"]);
        graph = addNode(graph, "auth", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });
        graph = {
            ...graph,
            nodes: graph.nodes.map((node) =>
                node.kind === "response"
                    ? ({
                          ...node,
                          data: { ...node.data, body: { kind: "static", value: node.id } },
                      } as GraphNode)
                    : node,
            ),
        };
        graph = connect(graph, "request", "next", "auth-1");
        graph = connect(graph, "auth-1", "pass", "response-1");
        graph = connect(graph, "auth-1", "fail", "response-2");

        const result = await executeGraph(graph, context());

        // No `x-api-key` on the request, and the node defaults to apiKey mode.
        expect(result.ok && result.response.body).toBe('"response-2"');
    });

    test("an empty graph with only an entry node still refuses cleanly", async () => {
        const result = await executeGraph(emptyGraph(), context());

        expect(result).toMatchObject({ ok: false, reason: "no_response_on_path" });
    });
});

describe("a query parameter tested against a boolean", () => {
    /**
     * The reported bug, end to end: `?is_stock=true` against a condition
     * reading *From the request → Query → is_stock* equals a typed `true`, with
     * a response on each branch. It took the false branch every time, because
     * the query gave the string `"true"` and the operand box gave the boolean.
     */
    function stockGraph(): GraphDocument {
        let graph = removeNodes(createDefaultGraph(), ["response"]);
        graph = addNode(graph, "condition", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });
        graph = addNode(graph, "response", { x: 0, y: 0 });

        graph = {
            ...graph,
            nodes: graph.nodes.map((node) => {
                if (node.id === "condition-1") {
                    return {
                        ...node,
                        data: {
                            left: { kind: "request", source: "query", path: "is_stock" },
                            op: "equals",
                            // Exactly what `coerceLiteral` stores when somebody
                            // types `true` into the operand box.
                            right: { kind: "static", value: true },
                        },
                    } as GraphNode;
                }

                if (node.kind === "response") {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            body: {
                                kind: "static",
                                value: node.id === "response-1" ? "yes available" : "Not available",
                            },
                        },
                    } as GraphNode;
                }

                return node;
            }),
        };

        graph = connect(graph, "request", "next", "condition-1");
        graph = connect(graph, "condition-1", "true", "response-1");
        graph = connect(graph, "condition-1", "false", "response-2");

        return graph;
    }

    async function answerFor(query: Readonly<Record<string, string>>) {
        const result = await executeGraph(stockGraph(), {
            ...context(),
            request: { ...REQUEST, query },
        });

        return result.ok ? JSON.parse(result.response.body) : null;
    }

    test("?is_stock=true takes the true branch", async () => {
        expect(await answerFor({ is_stock: "true" })).toBe("yes available");
    });

    test("?is_stock=false takes the false branch", async () => {
        expect(await answerFor({ is_stock: "false" })).toBe("Not available");
    });

    test("a missing parameter takes the false branch", async () => {
        expect(await answerFor({})).toBe("Not available");
    });

    /** Only the literal word, so a count of one is not a yes. */
    test("?is_stock=1 does not count as true", async () => {
        expect(await answerFor({ is_stock: "1" })).toBe("Not available");
    });
});
