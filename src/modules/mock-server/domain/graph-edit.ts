import { handlesFor, nodeDefinition } from "./node-registry";
import {
    GRAPH_SCHEMA_VERSION,
    type GraphDocument,
    type GraphEdge,
    type GraphNode,
    type NodeKind,
    type ValueExpr,
} from "../types/graph";

/**
 * Editing a graph, as pure functions.
 *
 * The same split the value tree uses: every operation the canvas offers is a
 * function here, so undo, copy/paste and auto-layout are unit-tested without
 * mounting React Flow. The component becomes a renderer plus a store.
 *
 * Ids are generated from a counter passed in rather than from `crypto` or a
 * clock, because a graph edit has to be reproducible in a test and because two
 * calls in one tick must not collide.
 */

export type NodeIdSource = () => string;

/** Deterministic when the seed is, which is what a test needs. */
export function createIdSource(prefix: string, start = 1): NodeIdSource {
    let next = start;

    return () => {
        const id = `${prefix}${next}`;
        next += 1;

        return id;
    };
}

/** The id a fresh node should take, avoiding everything already in the graph. */
export function freeNodeId(graph: GraphDocument, kind: NodeKind): string {
    const taken = new Set(graph.nodes.map((node) => node.id));
    let counter = 1;

    while (taken.has(`${kind}-${counter}`)) {
        counter += 1;
    }

    return `${kind}-${counter}`;
}

/**
 * Back to a request wired straight to its response, and nothing else.
 *
 * What "clear the canvas" has to mean here, and the shape of it is the decision
 * worth recording: it keeps the **response node's own data**. Removing every
 * node including that one would throw away the body the reader built — which
 * lives on that node, and which the route form edits through the same field —
 * so a button labelled as clearing the *flow* would have quietly cleared the
 * *response* as well. Logic goes; the two ends stay.
 *
 * A graph with no entry node is returned untouched: there is nothing to rebuild
 * around, and refusing beats inventing.
 */
export function resetGraph(graph: GraphDocument): GraphDocument {
    const entry = graph.nodes.find((node) => node.kind === "request");

    if (entry === undefined) {
        return graph;
    }

    const response = graph.nodes.find((node) => node.kind === "response");
    const stripped: GraphDocument = {
        ...graph,
        nodes:
            response === undefined
                ? [{ ...entry, position: { x: 0, y: 0 } }]
                : [
                      { ...entry, position: { x: 0, y: 0 } },
                      { ...response, position: { x: LAYOUT_COLUMN, y: 0 } },
                  ],
        edges: [],
    };

    return response === undefined ? stripped : connect(stripped, entry.id, "next", response.id);
}

/**
 * The body of the first response node, and the graph with a new one in it.
 *
 * "First" matches the rule the save path already follows: a graph may hold
 * several response nodes — one per branch — and the form outside the canvas
 * edits the one the inspector shows, which is the first until something passes
 * an id.
 *
 * These exist so the route form and the canvas can stop keeping two copies of
 * the body. They kept one each, the save sent both, and the form's copy won
 * unconditionally — so everything built in the flow editor was overwritten by
 * whatever the form happened to be holding, which for a fresh route was the
 * default `{ "message": … }` and after a clear was `{}`.
 */
export function readResponseBody(graph: GraphDocument): ValueExpr | null {
    const response = graph.nodes.find((node) => node.kind === "response");

    return response?.kind === "response" ? response.data.body : null;
}

/**
 * Whether the route form's body editor can honestly speak for this graph.
 *
 * True only for the shape a route starts in: one request wired straight to one
 * response, nothing between them. That is the common case and the form is the
 * fast way to edit it.
 *
 * The moment a graph branches, it stops being true. `readResponseBody` and
 * `writeResponseBody` both act on the *first* response node, so a form over a
 * condition with a response on each side shows one of them and silently edits
 * that one — which reads as the editor ignoring half the work. There is no
 * honest single-body view of a branching flow, so the form stops offering one
 * and points at the canvas, where each response is edited on its own node.
 */
export function hasSingleResponse(graph: GraphDocument): boolean {
    return graph.nodes.filter((node) => node.kind === "response").length === 1;
}

/**
 * Every variable name this graph sets, in canvas order.
 *
 * What the name picker on a `var` value offers. Reading the graph rather than
 * keeping a list is the same rule the rest of this module follows: a second copy
 * of a fact is a copy that can disagree with the first, and here the disagreement
 * would be a suggestion for a variable nothing writes — which resolves to `null`
 * at run time and looks like a request that arrived empty.
 *
 * Reachability is deliberately not considered. `validateGraph` is what catches a
 * write nothing runs, and a picker that hid a name because the node setting it is
 * not wired up yet would go empty in the middle of building the very flow that
 * is about to wire it.
 */
export function declaredVariables(graph: GraphDocument): readonly string[] {
    const names: string[] = [];

    for (const node of graph.nodes) {
        if (node.kind !== "setVariable") {
            continue;
        }

        const name = (node.data as { name?: unknown }).name;

        if (typeof name === "string" && name.trim() !== "" && !names.includes(name)) {
            names.push(name);
        }
    }

    return names;
}

export function writeResponseBody(graph: GraphDocument, body: ValueExpr): GraphDocument {
    let written = false;

    return {
        ...graph,
        nodes: graph.nodes.map((node) => {
            if (node.kind !== "response" || written) {
                return node;
            }

            written = true;

            return { ...node, data: { ...node.data, body } };
        }),
    };
}

export type CanvasPoint = { readonly x: number; readonly y: number };

export type CanvasView = {
    /** React Flow's pan/zoom transform, exactly as it reports it. */
    readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
    readonly size: { readonly width: number; readonly height: number };
};

/** Roughly what `StudioNode` measures, used only to centre a drop. */
const NODE_SIZE = { width: 180, height: 56 } as const;

/** How far a colliding drop steps before trying again. */
const DROP_STEP = 36;

/**
 * Where a node added from the palette should land.
 *
 * The middle of what the reader is currently looking at, which sounds obvious
 * and was not what happened: the palette used to drop at a fixed point in *graph*
 * coordinates, so once `fitView` had panned away — which it does on every open
 * with more than a node or two — every new node appeared somewhere off-screen
 * and had to be hunted for and dragged back. A canvas that puts new work outside
 * the window is worse than one with no palette at all.
 *
 * Pure, and it takes the viewport rather than reading it, so the arithmetic that
 * inverts React Flow's transform is unit-tested rather than trusted.
 *
 * A drop that would land on an existing node steps down and right until it is
 * clear. Deterministic, because nothing on this site draws from `Math.random` —
 * and a fixed step is also the version that never drops two nodes on the same
 * pixel.
 */
export function dropPosition(graph: GraphDocument, view: CanvasView | null): CanvasPoint {
    if (view === null || view.size.width === 0 || view.size.height === 0) {
        // Nothing has reported a viewport yet, which happens only before the
        // canvas has mounted. The origin is as good an answer as any and is
        // where `fitView` will be looking.
        return avoidCollisions(graph, { x: 0, y: 0 });
    }

    const { viewport, size } = view;

    // The inverse of React Flow's transform: screen = flow * zoom + offset.
    const centre = {
        x: (size.width / 2 - viewport.x) / viewport.zoom - NODE_SIZE.width / 2,
        y: (size.height / 2 - viewport.y) / viewport.zoom - NODE_SIZE.height / 2,
    };

    return avoidCollisions(graph, centre);
}

function avoidCollisions(graph: GraphDocument, start: CanvasPoint): CanvasPoint {
    let point = start;

    // Bounded rather than `while (true)`: a graph is capped well below this, and
    // an unbounded search in a renderer is a hang waiting for the wrong input.
    for (let attempt = 0; attempt < 64; attempt += 1) {
        const taken = graph.nodes.some(
            (node) =>
                Math.abs(node.position.x - point.x) < NODE_SIZE.width / 2 &&
                Math.abs(node.position.y - point.y) < NODE_SIZE.height / 2,
        );

        if (!taken) {
            return point;
        }

        point = { x: point.x + DROP_STEP, y: point.y + DROP_STEP };
    }

    return point;
}

export function addNode(
    graph: GraphDocument,
    kind: NodeKind,
    position: { x: number; y: number },
): GraphDocument {
    const node = {
        id: freeNodeId(graph, kind),
        kind,
        position,
        data: nodeDefinition(kind).defaults(),
    } as GraphNode;

    return { ...graph, nodes: [...graph.nodes, node] };
}

export function updateNodeData(
    graph: GraphDocument,
    nodeId: string,
    data: GraphNode["data"],
): GraphDocument {
    return {
        ...graph,
        nodes: graph.nodes.map((node) =>
            node.id === nodeId ? ({ ...node, data } as GraphNode) : node,
        ),
    };
}

/**
 * Moves a node, or returns the graph untouched when it did not actually move.
 *
 * The bail is not an optimisation. React Flow re-emits a `position` change with
 * the *same* coordinates when it measures a node on mount, and a new graph
 * object per emission feeds straight back into its controlled `nodes` prop —
 * which is how a fresh node turns into an update loop. Returning the same
 * reference ends it.
 */
export function moveNode(
    graph: GraphDocument,
    nodeId: string,
    position: { x: number; y: number },
): GraphDocument {
    const current = graph.nodes.find((node) => node.id === nodeId);

    if (current === undefined) {
        return graph;
    }

    if (current.position.x === position.x && current.position.y === position.y) {
        return graph;
    }

    return {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
    };
}

/**
 * Removes nodes and every edge touching them.
 *
 * The entry node cannot be removed however it is selected — a graph without one
 * has no meaning and `validateGraph` would refuse to save it, so the refusal
 * belongs where the reader can see it rather than three screens later.
 */
export function removeNodes(graph: GraphDocument, ids: readonly string[]): GraphDocument {
    const doomed = new Set(
        ids.filter((id) => graph.nodes.find((node) => node.id === id)?.kind !== "request"),
    );

    if (doomed.size === 0) {
        return graph;
    }

    return {
        ...graph,
        nodes: graph.nodes.filter((node) => !doomed.has(node.id)),
        edges: graph.edges.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target)),
    };
}

/**
 * Connects two nodes, replacing whatever left that handle before.
 *
 * One edge per handle is the whole control-flow model: execution follows a
 * single path, so two edges from `next` would make the next step ambiguous.
 * Branching is expressed by a node having several handles, never by a handle
 * having several edges.
 */
export function connect(
    graph: GraphDocument,
    source: string,
    sourceHandle: string,
    target: string,
): GraphDocument {
    if (source === target) {
        return graph;
    }

    const sourceNode = graph.nodes.find((node) => node.id === source);
    const targetNode = graph.nodes.find((node) => node.id === target);

    if (sourceNode === undefined || targetNode === undefined) {
        return graph;
    }

    if (!nodeDefinition(targetNode.kind).acceptsInput) {
        return graph;
    }

    if (!handlesFor(sourceNode).some((handle) => handle.id === sourceHandle)) {
        return graph;
    }

    // A back edge would make the graph cyclic, which `validateGraph` refuses at
    // save. Refusing it at the gesture is kinder than accepting a connection
    // that quietly makes the document unsaveable.
    if (reaches(graph, target, source)) {
        return graph;
    }

    const kept = graph.edges.filter(
        (edge) => !(edge.source === source && edge.sourceHandle === sourceHandle),
    );

    return {
        ...graph,
        edges: [
            ...kept,
            { id: `${source}:${sourceHandle}->${target}`, source, sourceHandle, target },
        ],
    };
}

export function disconnect(graph: GraphDocument, edgeId: string): GraphDocument {
    return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

/** Whether `to` is reachable from `from`, following edges. */
export function reaches(graph: GraphDocument, from: string, to: string): boolean {
    const seen = new Set<string>();
    const queue = [from];

    while (queue.length > 0) {
        const current = queue.shift() as string;

        if (current === to) {
            return true;
        }

        if (seen.has(current)) {
            continue;
        }

        seen.add(current);

        for (const edge of graph.edges) {
            if (edge.source === current) {
                queue.push(edge.target);
            }
        }
    }

    return false;
}

export type GraphFragment = {
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
};

/**
 * The selected nodes plus only the edges *between* them.
 *
 * An edge with one end outside the selection is dropped, because pasting it
 * would connect the copy to whatever the original was attached to — which is
 * never what copying a subgraph means.
 */
export function copyFragment(graph: GraphDocument, ids: readonly string[]): GraphFragment {
    const selected = new Set(ids);
    // The entry node is never copied: a second one is an invalid graph, and
    // silently dropping it on paste is more confusing than not taking it.
    const nodes = graph.nodes.filter((node) => selected.has(node.id) && node.kind !== "request");
    const kept = new Set(nodes.map((node) => node.id));

    return {
        nodes,
        edges: graph.edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)),
    };
}

export const PASTE_OFFSET = 40;

/**
 * Pastes a fragment with fresh ids, offset so the copy is visibly not the
 * original. Returns the new ids too, so the caller can select what it just made
 * — pasting and then not knowing what was pasted is the small thing that makes
 * a canvas feel broken.
 */
export function pasteFragment(
    graph: GraphDocument,
    fragment: GraphFragment,
    offset = PASTE_OFFSET,
): { graph: GraphDocument; ids: readonly string[] } {
    if (fragment.nodes.length === 0) {
        return { graph, ids: [] };
    }

    const remap = new Map<string, string>();
    let working = graph;

    for (const node of fragment.nodes) {
        const id = freeNodeId(working, node.kind);
        remap.set(node.id, id);

        working = {
            ...working,
            nodes: [
                ...working.nodes,
                {
                    ...node,
                    id,
                    position: { x: node.position.x + offset, y: node.position.y + offset },
                } as GraphNode,
            ],
        };
    }

    const edges = fragment.edges.map((edge) => {
        const source = remap.get(edge.source) as string;
        const target = remap.get(edge.target) as string;

        return {
            id: `${source}:${edge.sourceHandle}->${target}`,
            source,
            sourceHandle: edge.sourceHandle,
            target,
        };
    });

    return {
        graph: { ...working, edges: [...working.edges, ...edges] },
        ids: [...remap.values()],
    };
}

export const LAYOUT_COLUMN = 280;

export const LAYOUT_ROW = 130;

/**
 * Arranges the graph left to right by distance from the entry node.
 *
 * A layered walk rather than a physics simulation: a control-flow graph is a
 * DAG with a single source, so "how many steps from the start" is exactly the
 * column a node belongs in, and it is stable — running it twice moves nothing.
 * `dagre` would do the same job with better edge routing; this is here so the
 * button works without pulling a layout engine into the first chunk, and the
 * canvas can upgrade to `dagre` without the domain layer changing.
 */
export function autoLayout(graph: GraphDocument): GraphDocument {
    const entry = graph.nodes.find((node) => node.kind === "request");

    if (entry === undefined) {
        return graph;
    }

    const depth = new Map<string, number>([[entry.id, 0]]);
    const queue = [entry.id];

    while (queue.length > 0) {
        const current = queue.shift() as string;
        const currentDepth = depth.get(current) ?? 0;

        for (const edge of graph.edges) {
            if (edge.source !== current) {
                continue;
            }

            const known = depth.get(edge.target);

            // The deepest path wins, so a node fed by both a short and a long
            // branch sits after both rather than overlapping the short one.
            if (known === undefined || known < currentDepth + 1) {
                depth.set(edge.target, currentDepth + 1);
                queue.push(edge.target);
            }
        }
    }

    const rows = new Map<number, number>();

    return {
        ...graph,
        nodes: graph.nodes.map((node) => {
            // Anything unreachable is parked in a column of its own past the
            // graph rather than left on top of it.
            const column = depth.get(node.id) ?? maxDepth(depth) + 1;
            const row = rows.get(column) ?? 0;
            rows.set(column, row + 1);

            return { ...node, position: { x: column * LAYOUT_COLUMN, y: row * LAYOUT_ROW } };
        }),
    };
}

function maxDepth(depth: ReadonlyMap<string, number>): number {
    return [...depth.values()].reduce((best, value) => Math.max(best, value), 0);
}

/** An empty graph carrying only its entry node — what "clear" leaves behind. */
export function emptyGraph(): GraphDocument {
    return {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes: [{ id: "request-1", kind: "request", position: { x: 0, y: 0 }, data: {} }],
        edges: [],
    };
}
