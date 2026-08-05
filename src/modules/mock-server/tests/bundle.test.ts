import { describe, expect, test } from "bun:test";

import {
    BUNDLE_FORMAT,
    BUNDLE_VERSION,
    buildBundle,
    bundleFilename,
    readBundle,
    serializeBundle,
    type BundleEndpoint,
} from "@/modules/mock-server/domain/bundle";
import { createDefaultGraph } from "@/modules/mock-server/domain/graph";
import { addNode } from "@/modules/mock-server/domain/graph-edit";

function endpoint(overrides: Partial<BundleEndpoint> = {}): BundleEndpoint {
    return {
        method: "GET",
        path: "/users/:id",
        name: "Show user",
        description: null,
        isEnabled: true,
        graph: createDefaultGraph(),
        ...overrides,
    };
}

function bundle(endpoints: readonly BundleEndpoint[] = [endpoint()]) {
    return buildBundle({
        key: "payments-api",
        name: "Payments API",
        description: null,
        isPaused: false,
        endpoints,
    });
}

describe("buildBundle", () => {
    test("names its format and version, so a reader can refuse a stranger's file", () => {
        expect(bundle().format).toBe(BUNDLE_FORMAT);
        expect(bundle().version).toBe(BUNDLE_VERSION);
    });

    test("carries the server's public key and name", () => {
        expect(bundle().server).toEqual({
            key: "payments-api",
            name: "Payments API",
            description: null,
            isPaused: false,
        });
    });

    /**
     * The whole point. A summary of the response would export a mock that
     * answers differently from the one it came from — the delays, branches and
     * generators all live on the graph.
     */
    test("carries each route's whole graph, not a view of it", () => {
        const withDelay = addNode(createDefaultGraph(), "delay", { x: 0, y: 0 });
        const exported = bundle([endpoint({ graph: withDelay })]);

        expect(exported.endpoints[0].graph.nodes.map((node) => node.kind).sort()).toEqual([
            "delay",
            "request",
            "response",
        ]);
    });

    test("keeps a disabled route, and keeps it disabled", () => {
        expect(bundle([endpoint({ isEnabled: false })]).endpoints[0].isEnabled).toBe(false);
    });

    /**
     * The reason there is no `exportedAt` in the file: two exports of unchanged
     * work have to be byte-identical, or committing one makes every re-export a
     * diff about nothing.
     */
    test("two exports of the same server are byte-identical", () => {
        expect(serializeBundle(bundle())).toBe(serializeBundle(bundle()));
    });

    test("ends with a newline, like a text file should", () => {
        expect(serializeBundle(bundle()).endsWith("}\n")).toBe(true);
    });

    /** An id describes this installation's row, not the mock. */
    test("carries no ids or timestamps", () => {
        const text = serializeBundle(bundle());

        expect(text).not.toContain("workspaceId");
        expect(text).not.toContain("createdAt");
        expect(text).not.toContain("exportedAt");
        expect(text).not.toContain("updatedAt");
    });
});

describe("bundleFilename", () => {
    test("dates the file rather than the contents", () => {
        expect(bundleFilename("payments-api", new Date("2026-08-05T09:31:00Z"))).toBe(
            "payments-api-2026-08-05.json",
        );
    });
});

describe("readBundle", () => {
    /**
     * The round trip is what makes this a format rather than a dump: writing a
     * reader beside the writer is the only thing that proves the file holds
     * enough to rebuild a server from.
     */
    test("round-trips a server through serialise and read", () => {
        const original = bundle([
            endpoint(),
            endpoint({ method: "POST", path: "/users", name: "Create user" }),
        ]);
        const result = readBundle(JSON.parse(serializeBundle(original)));

        expect(result.ok).toBe(true);
        expect(result.ok && result.bundle).toEqual(original);
    });

    test("round-trips a graph with extra nodes in it", () => {
        const withDelay = addNode(createDefaultGraph(), "delay", { x: 40, y: 80 });
        const result = readBundle(
            JSON.parse(serializeBundle(bundle([endpoint({ graph: withDelay })]))),
        );

        expect(result.ok && result.bundle.endpoints[0].graph).toEqual(withDelay);
    });

    describe("refusals", () => {
        test("refuses something that is not an object", () => {
            expect(readBundle("nope")).toEqual({ ok: false, reason: "not_an_object" });
            expect(readBundle([])).toEqual({ ok: false, reason: "not_an_object" });
        });

        /** Somebody's OpenAPI file dropped in the wrong box. */
        test("refuses a file that is not one of ours", () => {
            expect(readBundle({ openapi: "3.1.0", paths: {} })).toEqual({
                ok: false,
                reason: "wrong_format",
            });
        });

        test("refuses a version newer than this build understands", () => {
            expect(
                readBundle({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION + 1, server: {} }),
            ).toEqual({ ok: false, reason: "unsupported_version" });
        });

        test("refuses a file with nothing usable in it", () => {
            expect(
                readBundle({
                    format: BUNDLE_FORMAT,
                    version: BUNDLE_VERSION,
                    server: { key: "a", name: "A" },
                    endpoints: [],
                }),
            ).toEqual({ ok: false, reason: "no_endpoints" });
        });
    });

    describe("degradation", () => {
        /** A file meant to be committed is a file somebody will hand-edit. */
        test("skips one unusable route and keeps the rest", () => {
            const good = JSON.parse(serializeBundle(bundle()));
            const mixed = {
                ...good,
                endpoints: [...good.endpoints, { method: "GET", path: "/a?b=1" }],
            };
            const result = readBundle(mixed);

            expect(result.ok && result.bundle.endpoints).toHaveLength(1);
            expect(result.ok && result.skipped).toEqual(["GET /a?b=1"]);
        });

        test("names what it skipped, so the loss is not silent", () => {
            const good = JSON.parse(serializeBundle(bundle()));
            const result = readBundle({
                ...good,
                endpoints: [...good.endpoints, { method: "POST", path: "/x", graph: "nonsense" }],
            });

            expect(result.ok && result.skipped).toEqual(["POST /x"]);
        });

        /** A hand-written file should not have to say a route is switched on. */
        test("treats a missing isEnabled as enabled", () => {
            const good = JSON.parse(serializeBundle(bundle()));
            const withoutFlag: Record<string, unknown> = { ...good.endpoints[0] };
            delete withoutFlag.isEnabled;

            const result = readBundle({ ...good, endpoints: [withoutFlag] });

            expect(result.ok && result.bundle.endpoints[0].isEnabled).toBe(true);
        });

        test("normalises a path on the way in", () => {
            const good = JSON.parse(serializeBundle(bundle()));
            const result = readBundle({
                ...good,
                endpoints: [{ ...good.endpoints[0], path: "users//:id/" }],
            });

            expect(result.ok && result.bundle.endpoints[0].path).toBe("/users/:id");
        });
    });
});
