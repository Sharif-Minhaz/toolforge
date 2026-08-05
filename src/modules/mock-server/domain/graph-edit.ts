import { handlesFor, nodeDefinition } from "./node-registry";
import {
    GRAPH_SCHEMA_VERSION,
    type GraphDocument,
    type GraphEdge,
    type GraphNode,
    type NodeKind,
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
