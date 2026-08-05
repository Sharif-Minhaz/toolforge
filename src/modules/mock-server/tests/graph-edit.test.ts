import { describe, expect, test } from "bun:test";

import {
    addNode,
    autoLayout,
    connect,
    copyFragment,
    disconnect,
    dropPosition,
    emptyGraph,
    freeNodeId,
    LAYOUT_COLUMN,
    moveNode,
    pasteFragment,
    reaches,
    readResponseBody,
    removeNodes,
    resetGraph,
    updateNodeData,
    writeResponseBody,
} from "@/modules/mock-server/domain/graph-edit";
import { createDefaultGraph, validateGraph } from "@/modules/mock-server/domain/graph";
import {
    handlesFor,
    isTerminalKind,
    nodeDefinition,
    placeableNodeKinds,
} from "@/modules/mock-server/domain/node-registry";
import { NODE_KINDS, type GraphDocument } from "@/modules/mock-server/types/graph";

const ORIGIN = { x: 0, y: 0 };

function withResponse(): GraphDocument {
    return createDefaultGraph();
}

describe("node registry", () => {
    test("covers every declared kind", () => {
        for (const kind of NODE_KINDS) {
            expect(nodeDefinition(kind).kind).toBe(kind);
        }
    });

    test("the response node is terminal", () => {
        expect(isTerminalKind("response")).toBe(true);
    });

    test("nothing else is terminal", () => {
        for (const kind of NODE_KINDS.filter((candidate) => candidate !== "response")) {
            expect(isTerminalKind(kind)).toBe(false);
        }
    });

    test("the entry node accepts no input", () => {
        expect(nodeDefinition("request").acceptsInput).toBe(false);
    });

    /** A second entry point is a graph with no meaning. */
    test("the entry node is not in the palette", () => {
        expect(placeableNodeKinds()).not.toContain("request");
    });

    /**
     * The SSRF and amplification surface. It became placeable in M8, and only
     * because the guard stack it needs now exists — so what is asserted here
     * changed from "nobody can place it" to "placing it does not by itself
     * reach the network". The real protection moved from the palette to the
     * injected `outbound` function, and `executeGraph` refuses when there is
     * none. See the execute tests for that half.
     */
    test("the outbound node is placeable now its guard stack exists", () => {
        expect(placeableNodeKinds()).toContain("httpRequest");
    });

    test("the outbound node branches on success and failure", () => {
        expect(
            nodeDefinition("httpRequest")
                .handles({})
                .map((handle) => handle.id),
        ).toEqual(["ok", "error"]);
    });

    test("a switch grows a handle per case, plus a default", () => {
        const handles = nodeDefinition("switch").handles({
            cases: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
            ],
        });

        expect(handles.map((handle) => handle.id)).toEqual(["case:a", "case:b", "default"]);
    });

    test("a switch with no cases still offers its default", () => {
        expect(
            nodeDefinition("switch")
                .handles({})
                .map((handle) => handle.id),
        ).toEqual(["default"]);
    });

    /** Stored data is JSONB, so every read of it has to survive nonsense. */
    test("a switch survives cases that are not objects", () => {
        expect(nodeDefinition("switch").handles({ cases: [1, "x", null] }).length).toBe(1);
    });

    test("a weighted branch grows a handle per branch", () => {
        expect(
            nodeDefinition("randomBranch")
                .handles(nodeDefinition("randomBranch").defaults())
                .map((handle) => handle.id),
        ).toEqual(["branch:a", "branch:b"]);
    });
});

describe("adding and removing", () => {
    test("adds a node with its defaults", () => {
        const graph = addNode(emptyGraph(), "delay", { x: 10, y: 20 });
        const added = graph.nodes.at(-1);

        expect(added?.kind).toBe("delay");
        expect(added?.data).toEqual({ ms: 250 });
        expect(added?.position).toEqual({ x: 10, y: 20 });
    });

    test("gives each node a free id", () => {
        const graph = addNode(addNode(emptyGraph(), "delay", ORIGIN), "delay", ORIGIN);

        expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    });

    test("freeNodeId skips ids already taken", () => {
        const graph = addNode(emptyGraph(), "delay", ORIGIN);

        expect(freeNodeId(graph, "delay")).toBe("delay-2");
    });

    test("removes a node and every edge touching it", () => {
        const graph = withResponse();
        const next = removeNodes(graph, ["response"]);

        expect(next.nodes.map((node) => node.id)).toEqual(["request"]);
        expect(next.edges).toEqual([]);
    });

    /** A graph without an entry has no meaning, so the refusal is at the gesture. */
    test("refuses to remove the entry node", () => {
        const graph = withResponse();

        expect(removeNodes(graph, ["request"])).toBe(graph);
    });

    test("removes the removable ones from a mixed selection", () => {
        const next = removeNodes(withResponse(), ["request", "response"]);

        expect(next.nodes.map((node) => node.id)).toEqual(["request"]);
    });

    test("moves a node", () => {
        const next = moveNode(withResponse(), "response", { x: 5, y: 6 });

        expect(next.nodes.find((node) => node.id === "response")?.position).toEqual({ x: 5, y: 6 });
    });

    /**
     * The regression that produced "Maximum update depth exceeded" on the
     * canvas. React Flow re-emits a `position` change with the *same*
     * coordinates when it measures a node on mount; a new graph object per
     * emission fed straight back into its controlled `nodes` prop and looped.
     * Returning the same reference is what ends it, so identity is the
     * assertion — not equality.
     */
    test("returns the same graph when a node did not actually move", () => {
        const graph = withResponse();
        const at = graph.nodes.find((node) => node.id === "response")?.position;

        expect(moveNode(graph, "response", { ...(at as { x: number; y: number }) })).toBe(graph);
    });

    test("returns the same graph for a node that is not there", () => {
        const graph = withResponse();

        expect(moveNode(graph, "ghost", { x: 1, y: 1 })).toBe(graph);
    });

    test("still returns a new graph for a real move", () => {
        const graph = withResponse();

        expect(moveNode(graph, "response", { x: 999, y: 999 })).not.toBe(graph);
    });
});

describe("connecting", () => {
    const base = removeNodes(withResponse(), ["response"]);

    test("connects two nodes", () => {
        const graph = addNode(base, "delay", ORIGIN);
        const next = connect(graph, "request", "next", "delay-1");

        expect(next.edges).toHaveLength(1);
        expect(next.edges[0]).toMatchObject({ source: "request", target: "delay-1" });
    });

    /**
     * One edge per handle is the whole control-flow model: two would make the
     * next step ambiguous. Branching is a node with several handles.
     */
    test("replaces whatever already left that handle", () => {
        let graph = addNode(addNode(base, "delay", ORIGIN), "delay", ORIGIN);
        graph = connect(graph, "request", "next", "delay-1");
        graph = connect(graph, "request", "next", "delay-2");

        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0].target).toBe("delay-2");
    });

    test("refuses to connect a node to itself", () => {
        const graph = addNode(base, "delay", ORIGIN);

        expect(connect(graph, "delay-1", "next", "delay-1")).toBe(graph);
    });

    test("refuses a handle the source does not have", () => {
        const graph = addNode(base, "delay", ORIGIN);

        expect(connect(graph, "request", "nope", "delay-1")).toBe(graph);
    });

    test("refuses to feed the entry node", () => {
        const graph = addNode(base, "delay", ORIGIN);
        const connected = connect(graph, "delay-1", "next", "request");

        expect(connected).toBe(graph);
    });

    test("refuses a node that is not in the graph", () => {
        expect(connect(base, "request", "next", "ghost")).toBe(base);
    });

    /** A cycle makes the document unsaveable; refusing the gesture is kinder. */
    test("refuses an edge that would close a cycle", () => {
        let graph = addNode(addNode(base, "delay", ORIGIN), "delay", ORIGIN);
        graph = connect(graph, "request", "next", "delay-1");
        graph = connect(graph, "delay-1", "next", "delay-2");

        expect(connect(graph, "delay-2", "next", "delay-1")).toBe(graph);
    });

    test("disconnects by edge id", () => {
        let graph = addNode(base, "delay", ORIGIN);
        graph = connect(graph, "request", "next", "delay-1");

        expect(disconnect(graph, graph.edges[0].id).edges).toEqual([]);
    });

    test("a graph the canvas built validates", () => {
        let graph = addNode(base, "response", ORIGIN);
        graph = connect(graph, "request", "next", "response-1");

        expect(validateGraph(graph).ok).toBe(true);
    });
});

describe("reaches", () => {
    test("finds a direct edge", () => {
        expect(reaches(withResponse(), "request", "response")).toBe(true);
    });

    test("a node reaches itself", () => {
        expect(reaches(withResponse(), "request", "request")).toBe(true);
    });

    test("does not follow edges backwards", () => {
        expect(reaches(withResponse(), "response", "request")).toBe(false);
    });
});

describe("copy and paste", () => {
    function threeNodes(): GraphDocument {
        let graph = addNode(addNode(withResponse(), "delay", ORIGIN), "delay", ORIGIN);
        graph = connect(graph, "delay-1", "next", "delay-2");

        return graph;
    }

    test("copies the selected nodes", () => {
        const fragment = copyFragment(threeNodes(), ["delay-1", "delay-2"]);

        expect(fragment.nodes.map((node) => node.id)).toEqual(["delay-1", "delay-2"]);
    });

    test("keeps an edge between two selected nodes", () => {
        expect(copyFragment(threeNodes(), ["delay-1", "delay-2"]).edges).toHaveLength(1);
    });

    /** Otherwise the copy attaches to whatever the original was attached to. */
    test("drops an edge with one end outside the selection", () => {
        expect(copyFragment(threeNodes(), ["delay-2"]).edges).toEqual([]);
    });

    test("never copies the entry node", () => {
        expect(copyFragment(threeNodes(), ["request", "delay-1"]).nodes.map((n) => n.id)).toEqual([
            "delay-1",
        ]);
    });

    test("pastes with fresh ids", () => {
        const graph = threeNodes();
        const fragment = copyFragment(graph, ["delay-1", "delay-2"]);
        const { graph: pasted, ids } = pasteFragment(graph, fragment);

        expect(ids).toEqual(["delay-3", "delay-4"]);
        expect(new Set(pasted.nodes.map((node) => node.id)).size).toBe(pasted.nodes.length);
    });

    test("pastes the internal edge, remapped", () => {
        const graph = threeNodes();
        const { graph: pasted } = pasteFragment(graph, copyFragment(graph, ["delay-1", "delay-2"]));
        const fresh = pasted.edges.filter((edge) => edge.source === "delay-3");

        expect(fresh).toHaveLength(1);
        expect(fresh[0].target).toBe("delay-4");
    });

    test("offsets the copy so it is visibly not the original", () => {
        const graph = moveNode(threeNodes(), "delay-1", { x: 100, y: 100 });
        const { graph: pasted } = pasteFragment(graph, copyFragment(graph, ["delay-1"]));
        const copy = pasted.nodes.find((node) => node.id === "delay-3");

        expect(copy?.position.x).toBeGreaterThan(100);
    });

    test("pasting nothing changes nothing", () => {
        const graph = threeNodes();

        expect(pasteFragment(graph, { nodes: [], edges: [] }).graph).toBe(graph);
    });
});

describe("autoLayout", () => {
    test("puts the entry node in the first column", () => {
        const laid = autoLayout(withResponse());

        expect(laid.nodes.find((node) => node.id === "request")?.position.x).toBe(0);
    });

    test("puts each step one column further along", () => {
        const laid = autoLayout(withResponse());

        expect(laid.nodes.find((node) => node.id === "response")?.position.x).toBe(LAYOUT_COLUMN);
    });

    /** Running it twice must move nothing, or the button feels broken. */
    test("is stable", () => {
        const once = autoLayout(withResponse());

        expect(autoLayout(once)).toEqual(once);
    });

    /**
     * A node fed by both a short and a long branch sits after both, rather than
     * landing on top of something in the short one.
     */
    test("places a join after its deepest input", () => {
        let graph = removeNodes(withResponse(), ["response"]);
        graph = addNode(
            addNode(addNode(graph, "delay", ORIGIN), "delay", ORIGIN),
            "response",
            ORIGIN,
        );
        graph = connect(graph, "request", "next", "delay-1");
        graph = connect(graph, "delay-1", "next", "delay-2");
        graph = connect(graph, "delay-2", "next", "response-1");

        const laid = autoLayout(graph);

        expect(laid.nodes.find((node) => node.id === "response-1")?.position.x).toBe(
            LAYOUT_COLUMN * 3,
        );
    });

    test("parks an unreachable node past the graph rather than on it", () => {
        const graph = addNode(withResponse(), "delay", ORIGIN);
        const laid = autoLayout(graph);
        const orphan = laid.nodes.find((node) => node.id === "delay-1");

        expect(orphan?.position.x).toBeGreaterThan(LAYOUT_COLUMN);
    });

    test("does not stack two nodes of one column on each other", () => {
        let graph = removeNodes(withResponse(), ["response"]);
        graph = addNode(addNode(graph, "response", ORIGIN), "response", ORIGIN);
        graph = connect(graph, "request", "next", "response-1");

        const laid = autoLayout(graph);
        const points = laid.nodes.map((node) => `${node.position.x},${node.position.y}`);

        expect(new Set(points).size).toBe(points.length);
    });

    test("a graph with no entry node is left alone", () => {
        const graph: GraphDocument = { schemaVersion: 1, nodes: [], edges: [] };

        expect(autoLayout(graph)).toBe(graph);
    });
});

describe("handlesFor", () => {
    test("reads a node's configured handles", () => {
        const graph = addNode(emptyGraph(), "randomBranch", ORIGIN);
        const node = graph.nodes.at(-1);

        expect(node && handlesFor(node).length).toBe(2);
    });

    test("a response node has no outputs", () => {
        const node = withResponse().nodes.find((candidate) => candidate.kind === "response");

        expect(node && handlesFor(node)).toEqual([]);
    });
});

describe("dropPosition", () => {
    const SIZE = { width: 800, height: 400 };

    /**
     * The bug this exists to prevent: the palette used to drop at a fixed point
     * in *graph* coordinates, so once `fitView` had panned — which it does on
     * every open — a new node appeared off-screen and had to be hunted for.
     */
    test("centres the node in an unpanned, unzoomed viewport", () => {
        const point = dropPosition(emptyGraph(), {
            viewport: { x: 0, y: 0, zoom: 1 },
            size: SIZE,
        });

        // Half the node's own width and height back from the middle, so the
        // node is centred rather than its corner.
        expect(point).toEqual({ x: 400 - 90, y: 200 - 28 });
    });

    test("follows a pan, so the drop lands where the reader is looking", () => {
        const point = dropPosition(emptyGraph(), {
            viewport: { x: -1_000, y: -600, zoom: 1 },
            size: SIZE,
        });

        expect(point).toEqual({ x: 1_400 - 90, y: 800 - 28 });
    });

    /** Screen distance and graph distance are not the same once zoom is not 1. */
    test("divides by the zoom rather than ignoring it", () => {
        const point = dropPosition(emptyGraph(), {
            viewport: { x: 0, y: 0, zoom: 2 },
            size: SIZE,
        });

        expect(point).toEqual({ x: 200 - 90, y: 100 - 28 });
    });

    test("a half-zoom pushes the centre further out, not closer in", () => {
        const point = dropPosition(emptyGraph(), {
            viewport: { x: 0, y: 0, zoom: 0.5 },
            size: SIZE,
        });

        expect(point).toEqual({ x: 800 - 90, y: 400 - 28 });
    });

    describe("collisions", () => {
        function occupied(at: { x: number; y: number }): GraphDocument {
            return {
                schemaVersion: 1,
                nodes: [{ id: "response-1", kind: "response", position: at, data: { body: null } }],
                edges: [],
            } as unknown as GraphDocument;
        }

        test("steps clear of a node already at the centre", () => {
            const view = { viewport: { x: 0, y: 0, zoom: 1 }, size: SIZE };
            const centre = dropPosition(emptyGraph(), view);
            const nudged = dropPosition(occupied(centre), view);

            expect(nudged).not.toEqual(centre);
            expect(nudged.x).toBeGreaterThan(centre.x);
            expect(nudged.y).toBeGreaterThan(centre.y);
        });

        /** Deterministic, because nothing on this site draws from `Math.random`. */
        test("gives the same answer twice for the same graph", () => {
            const view = { viewport: { x: 0, y: 0, zoom: 1 }, size: SIZE };
            const graph = occupied(dropPosition(emptyGraph(), view));

            expect(dropPosition(graph, view)).toEqual(dropPosition(graph, view));
        });

        test("leaves a node that is well clear alone", () => {
            const view = { viewport: { x: 0, y: 0, zoom: 1 }, size: SIZE };
            const centre = dropPosition(emptyGraph(), view);

            expect(dropPosition(occupied({ x: 5_000, y: 5_000 }), view)).toEqual(centre);
        });
    });

    /**
     * Before the canvas has mounted there is no viewport to centre on, so the
     * drop falls back to the origin — where `fitView` will be looking. It still
     * steps clear of the entry node, which an empty graph already has sitting
     * there, so even the fallback never buries a new node under an old one.
     */
    test("falls back to near the origin when nothing has reported a viewport", () => {
        const point = dropPosition(emptyGraph(), null);

        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThan(200);
        expect(point).not.toEqual(emptyGraph().nodes[0].position);
    });

    test("treats a zero-sized canvas as no viewport at all", () => {
        expect(
            dropPosition(emptyGraph(), {
                viewport: { x: 0, y: 0, zoom: 1 },
                size: { width: 0, height: 0 },
            }),
        ).toEqual(dropPosition(emptyGraph(), null));
    });
});

describe("resetGraph", () => {
    /**
     * The rule the Clear button rests on: logic goes, the two ends stay. The
     * response node carries the body — the same body the route form edits — so
     * removing it would make a button labelled as clearing the *flow* quietly
     * clear the *response* too.
     */
    test("keeps the request and the response, drops everything between", () => {
        let graph = withResponse();
        graph = addNode(graph, "delay", ORIGIN);
        graph = addNode(graph, "log", ORIGIN);

        const cleared = resetGraph(graph);

        expect(cleared.nodes.map((node) => node.kind).sort()).toEqual(["request", "response"]);
    });

    test("keeps the response node's own data", () => {
        const graph = updateNodeData(withResponse(), "response", {
            body: { kind: "static", value: "kept" },
        } as never);
        const cleared = resetGraph(graph);

        expect(cleared.nodes.find((node) => node.kind === "response")?.data).toEqual({
            body: { kind: "static", value: "kept" },
        } as never);
    });

    test("rewires the request straight to the response", () => {
        let graph = withResponse();
        graph = addNode(graph, "delay", ORIGIN);

        const cleared = resetGraph(graph);

        expect(cleared.edges).toHaveLength(1);
        expect(cleared.edges[0]).toMatchObject({ source: "request", target: "response" });
    });

    /** A cleared graph still has to be one the executor accepts. */
    test("produces a graph that validates", () => {
        expect(validateGraph(resetGraph(addNode(withResponse(), "delay", ORIGIN))).ok).toBe(true);
    });

    test("lays the two survivors out rather than leaving them where they were", () => {
        const graph = moveNode(withResponse(), "response", { x: 4_000, y: 4_000 });
        const cleared = resetGraph(graph);

        expect(cleared.nodes.find((node) => node.kind === "request")?.position).toEqual({
            x: 0,
            y: 0,
        });
        expect(cleared.nodes.find((node) => node.kind === "response")?.position).toEqual({
            x: LAYOUT_COLUMN,
            y: 0,
        });
    });

    test("survives a graph that has no response node", () => {
        const graph = removeNodes(withResponse(), ["response"]);
        const cleared = resetGraph(graph);

        expect(cleared.nodes.map((node) => node.kind)).toEqual(["request"]);
        expect(cleared.edges).toEqual([]);
    });

    /** Nothing sensible to rebuild around, so refusing beats inventing. */
    test("returns a graph with no entry node untouched", () => {
        const orphan: GraphDocument = { schemaVersion: 1, nodes: [], edges: [] };

        expect(resetGraph(orphan)).toBe(orphan);
    });
});

describe("the response body on a graph", () => {
    test("reads the body off the response node", () => {
        expect(readResponseBody(withResponse())).toEqual({
            kind: "object",
            fields: [{ key: "message", value: { kind: "static", value: "Hello from ToolForge" } }],
        });
    });

    test("reads null from a graph with no response node", () => {
        expect(readResponseBody(removeNodes(withResponse(), ["response"]))).toBeNull();
    });

    /**
     * The bug this pair replaced: the route form and the canvas each kept a
     * copy of the body, the save sent both, and the form's won unconditionally
     * — so a response built in the flow editor came back as whatever the form
     * happened to be holding. One reader and one writer over the node itself is
     * what makes the two editors edit the same thing.
     */
    test("writes a new body onto the response node", () => {
        const next = writeResponseBody(withResponse(), { kind: "static", value: "replaced" });

        expect(readResponseBody(next)).toEqual({ kind: "static", value: "replaced" });
    });

    test("leaves the rest of the node's data alone", () => {
        const next = writeResponseBody(withResponse(), { kind: "static", value: "x" });
        const response = next.nodes.find((node) => node.kind === "response");

        expect(response?.kind === "response" && response.data.status).toBe(200);
    });

    test("leaves every other node alone", () => {
        const before = addNode(withResponse(), "delay", ORIGIN);
        const after = writeResponseBody(before, { kind: "static", value: "x" });

        expect(after.nodes.find((node) => node.kind === "delay")).toEqual(
            before.nodes.find((node) => node.kind === "delay") as never,
        );
        expect(after.edges).toEqual(before.edges);
    });

    /** Same rule the save path follows: the form edits the first one. */
    test("writes only the first response node", () => {
        const two = addNode(withResponse(), "response", ORIGIN);
        const after = writeResponseBody(two, { kind: "static", value: "first" });
        const bodies = after.nodes
            .filter((node) => node.kind === "response")
            .map((node) => (node.kind === "response" ? node.data.body : null));

        expect(bodies[0]).toEqual({ kind: "static", value: "first" });
        expect(bodies[1]).not.toEqual({ kind: "static", value: "first" });
    });

    test("a graph with no response node comes back unchanged in content", () => {
        const none = removeNodes(withResponse(), ["response"]);

        expect(writeResponseBody(none, { kind: "static", value: "x" }).nodes).toEqual(none.nodes);
    });
});
