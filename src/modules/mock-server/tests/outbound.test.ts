import { describe, expect, test } from "bun:test";

import {
    ALLOWED_OUTBOUND_SCHEMES,
    checkOutboundUrl,
    MAX_OUTBOUND_CALLS,
    MAX_OUTBOUND_REDIRECTS,
    pickResponseHeaders,
    sanitizeOutboundHeaders,
} from "@/modules/mock-server/domain/outbound";
import { executeGraph } from "@/modules/mock-server/domain/execute";
import type { ExecutionContext, NormalizedRequest } from "@/modules/mock-server/types/graph";

const REQUEST: NormalizedRequest = {
    method: "GET",
    path: "/",
    params: {},
    query: {},
    headers: {},
    cookies: {},
    body: null,
};

function baseContext(): ExecutionContext {
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

describe("checkOutboundUrl", () => {
    test("accepts an https URL", () => {
        expect(checkOutboundUrl("https://api.example.com/v1").ok).toBe(true);
    });

    test("accepts an http URL", () => {
        expect(checkOutboundUrl("http://api.example.com").ok).toBe(true);
    });

    test("trims surrounding whitespace", () => {
        expect(checkOutboundUrl("  https://example.com  ").ok).toBe(true);
    });

    test("refuses something that is not a URL", () => {
        expect(checkOutboundUrl("not a url")).toEqual({ ok: false, reason: "invalid_url" });
    });

    test("refuses the empty string", () => {
        expect(checkOutboundUrl("")).toEqual({ ok: false, reason: "invalid_url" });
    });

    describe("schemes", () => {
        for (const scheme of [
            "file:///etc/passwd",
            "gopher://x",
            "data:text/plain,hi",
            "ftp://x",
        ]) {
            test(`refuses ${scheme.split(":")[0]}`, () => {
                expect(checkOutboundUrl(scheme)).toEqual({
                    ok: false,
                    reason: "scheme_not_allowed",
                });
            });
        }

        test("allows exactly two schemes", () => {
            expect(ALLOWED_OUTBOUND_SCHEMES).toEqual(["http:", "https:"]);
        });
    });

    /** Credentials would be sent to whatever the guard resolves. */
    test("refuses credentials embedded in the URL", () => {
        expect(checkOutboundUrl("https://user:pass@example.com")).toEqual({
            ok: false,
            reason: "invalid_url",
        });
    });

    /**
     * Shape is not safety. This passes precisely because it is well-formed, and
     * the address guard is what refuses it once DNS has answered — which is the
     * whole reason the check happens after resolution rather than on the name.
     */
    test("a public name that resolves privately passes the shape check", () => {
        expect(checkOutboundUrl("http://metadata.attacker.example/").ok).toBe(true);
    });
});

describe("sanitizeOutboundHeaders", () => {
    /** Forwarding these would let a mock impersonate its caller upstream. */
    test("drops credential headers", () => {
        expect(
            sanitizeOutboundHeaders({
                authorization: "Bearer x",
                cookie: "s=1",
                "proxy-authorization": "y",
            }),
        ).toEqual({});
    });

    /** Would let a request target one server while claiming to address another. */
    test("drops the host header", () => {
        expect(sanitizeOutboundHeaders({ host: "internal.example" })).toEqual({});
    });

    test("drops hop-by-hop headers", () => {
        expect(
            sanitizeOutboundHeaders({ connection: "keep-alive", "transfer-encoding": "chunked" }),
        ).toEqual({});
    });

    test("keeps an ordinary header", () => {
        expect(sanitizeOutboundHeaders({ "X-Trace": "abc" })).toEqual({ "x-trace": "abc" });
    });

    test("lower-cases names", () => {
        expect(sanitizeOutboundHeaders({ "Content-Type": "application/json" })).toEqual({
            "content-type": "application/json",
        });
    });

    /** A newline in a value is a request-splitting attempt. */
    test("drops a value carrying a carriage return", () => {
        expect(sanitizeOutboundHeaders({ "x-a": "one\r\nInjected: yes" })).toEqual({});
    });

    test("drops a value carrying a newline", () => {
        expect(sanitizeOutboundHeaders({ "x-a": "one\nInjected: yes" })).toEqual({});
    });
});

describe("pickResponseHeaders", () => {
    test("keeps the content type", () => {
        expect(pickResponseHeaders({ "content-type": "application/json" })).toEqual({
            "content-type": "application/json",
        });
    });

    /**
     * A mock returning a third party's `set-cookie` would be laundering
     * somebody else's session through this origin.
     */
    test("drops set-cookie", () => {
        expect(pickResponseHeaders({ "set-cookie": "session=abc" })).toEqual({});
    });

    test("drops an upstream's security headers", () => {
        expect(
            pickResponseHeaders({
                "strict-transport-security": "max-age=1",
                "content-security-policy": "default-src 'none'",
            }),
        ).toEqual({});
    });

    test("matches case-insensitively", () => {
        expect(pickResponseHeaders({ "Content-Type": "text/plain" })).toEqual({
            "content-type": "text/plain",
        });
    });
});

describe("the budgets", () => {
    /** A graph must not become a fan-out engine. */
    test("caps calls per execution in the low single digits", () => {
        expect(MAX_OUTBOUND_CALLS).toBeGreaterThan(0);
        expect(MAX_OUTBOUND_CALLS).toBeLessThanOrEqual(5);
    });

    /**
     * Enough for the `http → https → canonical host` chain real APIs use, and
     * no more — each hop is a fresh destination that has to be re-guarded.
     */
    test("caps redirects at the length a real chain needs", () => {
        expect(MAX_OUTBOUND_REDIRECTS).toBeGreaterThanOrEqual(2);
        expect(MAX_OUTBOUND_REDIRECTS).toBeLessThanOrEqual(5);
    });
});

describe("reaching the network from a graph", () => {
    /**
     * The invariant that replaced "the node is unplaceable". A context built
     * without an `outbound` function cannot make a request at all, so the whole
     * surface is closed by construction rather than by a flag somebody could
     * forget — the node is inert until the serve path deliberately wires the
     * guard stack in.
     */
    test("a context with no outbound function refuses the node", async () => {
        const graph = {
            schemaVersion: 1,
            nodes: [
                { id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} },
                {
                    id: "h",
                    kind: "httpRequest",
                    position: { x: 0, y: 0 },
                    data: { url: { kind: "static", value: "https://example.com" } },
                },
            ],
            edges: [{ id: "e", source: "r", sourceHandle: "next", target: "h" }],
        };

        const result = await executeGraph(graph, baseContext());

        expect(result).toMatchObject({ ok: false, reason: "unsupported_node" });
    });

    /**
     * Both outcomes continue rather than failing the graph: an author who wired
     * the `error` handle wants to model what their app does when the upstream is
     * down, and a node that killed the request would make that unmodellable.
     */
    test("a refused call follows the error handle rather than failing", async () => {
        const graph = {
            schemaVersion: 1,
            nodes: [
                { id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} },
                {
                    id: "h",
                    kind: "httpRequest",
                    position: { x: 0, y: 0 },
                    data: { url: { kind: "static", value: "https://example.com" }, saveAs: "out" },
                },
                {
                    id: "resp",
                    kind: "response",
                    position: { x: 0, y: 0 },
                    data: {
                        status: 502,
                        contentType: "application/json",
                        headers: [],
                        body: { kind: "var", name: "out" },
                    },
                },
            ],
            edges: [
                { id: "e1", source: "r", sourceHandle: "next", target: "h" },
                { id: "e2", source: "h", sourceHandle: "error", target: "resp" },
            ],
        };

        const result = await executeGraph(graph, {
            ...baseContext(),
            outbound: async () => ({ ok: false, reason: "blocked_address" }),
        });

        expect(result.ok).toBe(true);
        expect(result.ok && JSON.parse(result.response.body)).toEqual({
            error: "blocked_address",
        });
    });

    test("a successful call saves its body into a variable", async () => {
        const graph = {
            schemaVersion: 1,
            nodes: [
                { id: "r", kind: "request", position: { x: 0, y: 0 }, data: {} },
                {
                    id: "h",
                    kind: "httpRequest",
                    position: { x: 0, y: 0 },
                    data: { url: { kind: "static", value: "https://example.com" }, saveAs: "out" },
                },
                {
                    id: "resp",
                    kind: "response",
                    position: { x: 0, y: 0 },
                    data: {
                        status: 200,
                        contentType: "application/json",
                        headers: [],
                        body: { kind: "var", name: "out" },
                    },
                },
            ],
            edges: [
                { id: "e1", source: "r", sourceHandle: "next", target: "h" },
                { id: "e2", source: "h", sourceHandle: "ok", target: "resp" },
            ],
        };

        const result = await executeGraph(graph, {
            ...baseContext(),
            outbound: async () => ({ ok: true, status: 200, headers: {}, body: { id: 7 } }),
        });

        expect(result.ok && JSON.parse(result.response.body)).toEqual({ id: 7 });
    });
});
