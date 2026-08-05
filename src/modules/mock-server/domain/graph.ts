import { MAX_STATUS_CODE, MAX_VALUE_DEPTH, MIN_STATUS_CODE } from "./constants";
import { DEFAULT_CONTENT_TYPE, isAllowedContentType } from "./content-type";
import {
    GRAPH_SCHEMA_VERSION,
    IMPLEMENTED_NODE_KINDS,
    NODE_KINDS,
    VALUE_KINDS,
    type GraphDocument,
    type GraphEdge,
    type GraphNode,
    type GraphProblem,
    type GraphValidation,
    type JsonValue,
    type NodeKind,
    type ResponseNodeData,
    type ValueExpr,
} from "../types/graph";

/**
 * Building, reading and checking an endpoint's graph.
 *
 * The graph is the source of truth for what an endpoint returns, and it is
 * stored as JSONB — which means it arrives back from the database as `unknown`
 * and every read has to prove its shape. Two rules follow, and both matter more
 * than they look:
 *
 * **Validation happens at save, not at execution.** A graph that cannot answer
 * a request should fail while its author is looking at it, not at three in the
 * morning in somebody's integration test. `validateGraph` returns every problem
 * it finds rather than the first, so one round trip fixes them all.
 *
 * **Reading is total.** `readGraph` never throws on a stored document, however
 * it was mangled — it reports. A row that cannot be parsed still has to render
 * a page that explains itself.
 */

const RESPONSE_NODE_ID = "response";

const REQUEST_NODE_ID = "request";

/**
 * What a new endpoint starts as: an entry, a response, and the edge between.
 *
 * Written as a real `GraphDocument` from the very first milestone rather than
 * as a placeholder shape, so the canvas that arrives in M3 edits exactly this
 * and no migration is needed in between.
 */
export function createDefaultGraph(
    body: JsonValue = { message: "Hello from ToolForge" },
): GraphDocument {
    return {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes: [
            { id: REQUEST_NODE_ID, kind: "request", position: { x: 0, y: 0 }, data: {} },
            {
                id: RESPONSE_NODE_ID,
                kind: "response",
                position: { x: 320, y: 0 },
                data: {
                    status: 200,
                    contentType: DEFAULT_CONTENT_TYPE,
                    headers: [],
                    body: { kind: "static", value: body },
                },
            },
        ],
        edges: [
            {
                id: "request-response",
                source: REQUEST_NODE_ID,
                sourceHandle: "next",
                target: RESPONSE_NODE_ID,
            },
        ],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNode(raw: unknown): GraphNode | null {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.kind !== "string") {
        return null;
    }

    if (!(NODE_KINDS as readonly string[]).includes(raw.kind)) {
        return null;
    }

    const position = isRecord(raw.position) ? raw.position : {};
    const node = {
        id: raw.id,
        kind: raw.kind as NodeKind,
        position: {
            x: typeof position.x === "number" ? position.x : 0,
            y: typeof position.y === "number" ? position.y : 0,
        },
        data: isRecord(raw.data) ? raw.data : {},
    };

    return node as GraphNode;
}

function readEdge(raw: unknown): GraphEdge | null {
    if (
        !isRecord(raw) ||
        typeof raw.id !== "string" ||
        typeof raw.source !== "string" ||
        typeof raw.target !== "string"
    ) {
        return null;
    }

    return {
        id: raw.id,
        source: raw.source,
        sourceHandle: typeof raw.sourceHandle === "string" ? raw.sourceHandle : "next",
        target: raw.target,
    };
}

export type ReadGraphResult =
    | { readonly ok: true; readonly graph: GraphDocument }
    | { readonly ok: false; readonly reason: "not_a_document" | "unknown_schema_version" };

/**
 * A stored JSONB value, back as a document — or a reason it is not one.
 *
 * Nodes and edges that cannot be read are dropped rather than failing the whole
 * document, because a graph missing one node still renders and still explains
 * itself, while a page that refuses to load explains nothing. `validateGraph`
 * is what turns the survivors into a yes or a no.
 */
export function readGraph(raw: unknown): ReadGraphResult {
    if (!isRecord(raw)) {
        return { ok: false, reason: "not_a_document" };
    }

    if (raw.schemaVersion !== GRAPH_SCHEMA_VERSION) {
        // Where a version 2 arrives, `migrateGraph` handles it before this
        // point. Anything else is a document this build cannot reason about,
        // and guessing would be worse than saying so.
        return { ok: false, reason: "unknown_schema_version" };
    }

    const nodes = Array.isArray(raw.nodes)
        ? raw.nodes.map(readNode).filter((node): node is GraphNode => node !== null)
        : [];
    const edges = Array.isArray(raw.edges)
        ? raw.edges.map(readEdge).filter((edge): edge is GraphEdge => edge !== null)
        : [];

    return { ok: true, graph: { schemaVersion: GRAPH_SCHEMA_VERSION, nodes, edges } };
}

/**
 * Walks a document forward to the current schema version.
 *
 * A no-op today because there is only one version. It exists now so that the
 * seam is in place before it is needed: the first time the node set changes,
 * the change is a case in this function rather than a migration over every row
 * of `endpoints`.
 */
export function migrateGraph(raw: unknown): unknown {
    return raw;
}

/**
 * Shape only — is this a `ValueExpr` at all, and does it nest within the depth
 * cap. Whether this build can *resolve* it is a separate question, answered by
 * `usesOnlySupportedValues`, because the two failures deserve different words.
 */
function isValueExpr(value: unknown, depth: number): value is ValueExpr {
    if (depth > MAX_VALUE_DEPTH || !isRecord(value) || typeof value.kind !== "string") {
        return false;
    }

    if (!(VALUE_KINDS as readonly string[]).includes(value.kind)) {
        return false;
    }

    switch (value.kind) {
        case "static":
            return "value" in value;
        case "object":
            return (
                Array.isArray(value.fields) &&
                value.fields.every(
                    (field) =>
                        isRecord(field) &&
                        typeof field.key === "string" &&
                        isValueExpr(field.value, depth + 1),
                )
            );
        case "array":
            return isValueExpr(value.of, depth + 1);
        default:
            // Declared in the union and landing with M2's value picker.
            // Shape-checking their fields now would be guessing at a UI that
            // does not exist yet.
            return true;
    }
}

/** Which value kinds `resolveValue` can actually produce a result for today. */
function usesOnlySupportedValues(value: ValueExpr, depth = 0): boolean {
    if (depth > MAX_VALUE_DEPTH) {
        return false;
    }

    switch (value.kind) {
        case "static":
            return true;
        case "object":
            return value.fields.every((field) => usesOnlySupportedValues(field.value, depth + 1));
        case "array":
            return usesOnlySupportedValues(value.of, depth + 1);
        default:
            return false;
    }
}

function readResponseData(node: GraphNode): ResponseNodeData | null {
    if (node.kind !== "response") {
        return null;
    }

    return node.data;
}

/**
 * Every reason a graph could not answer a request, found in one pass.
 *
 * The reachability and termination checks are the ones worth having: a node
 * nobody can arrive at is dead weight the author almost certainly did not
 * intend, and a path that runs out of edges without reaching a `response` is an
 * endpoint that would hang or 500 at exactly the moment somebody depended on it.
 */
export function validateGraph(raw: unknown): GraphValidation {
    const read = readGraph(migrateGraph(raw));

    if (!read.ok) {
        return { ok: false, problems: [{ reason: read.reason }] };
    }

    const { graph } = read;
    const problems: GraphProblem[] = [];

    const entries = graph.nodes.filter((node) => node.kind === "request");

    if (entries.length === 0) {
        problems.push({ reason: "no_request_node" });
    }

    if (entries.length > 1) {
        problems.push({ reason: "many_request_nodes" });
    }

    if (!graph.nodes.some((node) => node.kind === "response")) {
        problems.push({ reason: "no_response_node" });
    }

    for (const node of graph.nodes) {
        if (!(IMPLEMENTED_NODE_KINDS as readonly string[]).includes(node.kind)) {
            problems.push({ reason: "unsupported_node", nodeId: node.id });
            continue;
        }

        const response = readResponseData(node);

        if (response === null) {
            continue;
        }

        if (
            !Number.isInteger(response.status) ||
            response.status < MIN_STATUS_CODE ||
            response.status > MAX_STATUS_CODE
        ) {
            problems.push({ reason: "invalid_status", nodeId: node.id });
        }

        if (!isValueExpr(response.body, 0)) {
            problems.push({ reason: "value_too_deep", nodeId: node.id });
        } else if (!usesOnlySupportedValues(response.body)) {
            problems.push({ reason: "unsupported_value", nodeId: node.id });
        }

        if (!isAllowedContentType(response.contentType)) {
            // Not fatal — `resolveContentType` collapses it to text/plain — but
            // the author should be told rather than discovering it from curl.
            problems.push({ reason: "unsupported_value", nodeId: node.id });
        }
    }

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoing = new Map<string, GraphEdge[]>();

    for (const edge of graph.edges) {
        if (!byId.has(edge.source) || !byId.has(edge.target)) {
            problems.push({ reason: "unknown_handle", nodeId: edge.source });
            continue;
        }

        outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    }

    const entry = entries[0];

    if (entry !== undefined) {
        const reached = new Set<string>();
        const onStack = new Set<string>();
        let sawCycle = false;

        const walk = (nodeId: string): void => {
            if (onStack.has(nodeId)) {
                sawCycle = true;

                return;
            }

            if (reached.has(nodeId)) {
                return;
            }

            reached.add(nodeId);
            onStack.add(nodeId);

            const node = byId.get(nodeId);
            const next = outgoing.get(nodeId) ?? [];

            if (next.length === 0 && node?.kind !== "response") {
                problems.push({ reason: "path_without_response", nodeId });
            }

            for (const edge of next) {
                walk(edge.target);
            }

            onStack.delete(nodeId);
        };

        walk(entry.id);

        if (sawCycle) {
            problems.push({ reason: "cycle" });
        }

        for (const node of graph.nodes) {
            if (!reached.has(node.id)) {
                problems.push({ reason: "unreachable_node", nodeId: node.id });
            }
        }
    }

    return problems.length === 0 ? { ok: true, graph } : { ok: false, problems };
}
