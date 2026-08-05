import { MAX_EXECUTION_STEPS, MAX_RESPONSE_BYTES } from "./constants";
import { isJsonType, resolveContentType } from "./content-type";
import { readGraph, migrateGraph } from "./graph";
import {
    planDelay,
    readLogLine,
    runAuth,
    runCondition,
    runHttpRequest,
    runRandomBranch,
    runSetVariable,
    runSwitch,
    runTransform,
} from "./nodes";
import { resolveValue } from "./values";
import type { LogLine } from "./nodes";
import type {
    ExecutionContext,
    ExecutionResult,
    GraphDocument,
    GraphNode,
    JsonValue,
    MockResponse,
    NodeResult,
    TraceEntry,
} from "../types/graph";

/**
 * Walking a graph until something answers.
 *
 * One executor, two callers — the public route handler and, from M3, the
 * studio's preview. That is deliberate and is what makes preview and production
 * incapable of disagreeing; a browser-side reimplementation would drift the
 * first time a node gained an option.
 *
 * Three budgets bound it, and each exists for a failure that has actually
 * happened to somebody:
 *
 * - **Steps.** Cycles are rejected at save time, so this is a backstop. A
 *   backstop is still needed, because a row written before a validation rule
 *   existed is a row that never passed it.
 * - **Deadline.** An absolute instant rather than a duration, because it
 *   outlives any one node. Reporting `deadline_exceeded` beats being killed by
 *   the platform mid-response and returning nothing at all.
 * - **Response size.** Measured in bytes after serialisation, not in items
 *   before it, since one deeply-nested value can outweigh a thousand shallow
 *   ones.
 */

/**
 * One node's turn.
 *
 * Synchronous by design. The only node that waits is `delay`, and it returns a
 * *plan* rather than sleeping — the executor owns the single `await`, so a test
 * never has to wait for real time and the deadline stays checked in one place.
 */
function runNode(node: GraphNode, context: ExecutionContext, log: LogLine[]): NodeResult {
    switch (node.kind) {
        case "request":
            // The entry anchor does nothing but name where execution begins.
            return { kind: "continue", handle: "next" };

        case "auth":
            return runAuth(node, context);

        case "condition":
            return runCondition(node, context);

        case "switch":
            return runSwitch(node, context);

        case "randomBranch":
            return runRandomBranch(node, context);

        case "setVariable":
            return runSetVariable(node, context);

        case "log": {
            const line = readLogLine(node, context);

            if (line !== null) {
                // Collected into the trace, never written to this deployment's
                // stdout. A visitor's mock must not be able to put arbitrary
                // text into our logs.
                log.push(line);
            }

            return { kind: "continue", handle: "next" };
        }

        case "transform":
            return runTransform();

        case "response": {
            const resolved = resolveValue(node.data.body, context);

            if (!resolved.ok) {
                return { kind: "error", reason: resolved.reason };
            }

            return {
                kind: "respond",
                response: {
                    status: node.data.status,
                    headers: [
                        { name: "content-type", value: resolveContentType(node.data.contentType) },
                        ...node.data.headers,
                    ],
                    body: serializeBody(resolved.value, node.data.contentType),
                },
            };
        }

        default:
            // Reachable only for a graph stored before this build narrowed the
            // node set, since `validateGraph` refuses these at save.
            return { kind: "error", reason: "unsupported_node" };
    }
}

/**
 * JSON gets `JSON.stringify`; everything else gets the value as text.
 *
 * A string body under `text/plain` is emitted raw rather than quoted — the
 * author asked for plain text, and `"hello"` with the quotes is not what
 * anybody means.
 */
function serializeBody(value: JsonValue, contentType: string): string {
    if (isJsonType(contentType)) {
        return JSON.stringify(value ?? null);
    }

    return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

function byteLength(body: string): number {
    return new TextEncoder().encode(body).length;
}

export async function executeGraph(
    raw: unknown,
    context: ExecutionContext,
): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const log: LogLine[] = [];
    const read = readGraph(migrateGraph(raw));

    if (!read.ok) {
        return { ok: false, reason: "graph_invalid", trace, log };
    }

    const graph: GraphDocument = read.graph;
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const entry = graph.nodes.find((node) => node.kind === "request");

    if (entry === undefined) {
        return { ok: false, reason: "no_entry_node", trace, log };
    }

    let current: GraphNode | undefined = entry;
    let steps = 0;

    while (current !== undefined) {
        if (steps >= MAX_EXECUTION_STEPS) {
            return { ok: false, reason: "step_budget_exceeded", nodeId: current.id, trace, log };
        }

        if (context.clock() >= context.deadlineAt) {
            return { ok: false, reason: "deadline_exceeded", nodeId: current.id, trace, log };
        }

        steps += 1;

        const startedAt = context.clock();

        // The single `await` in the executor. A delay computes its duration
        // purely and waits here, so the deadline is checked around it in one
        // place rather than inside every node that might sleep.
        if (current.kind === "delay") {
            const plan = planDelay(current, context);

            if (plan.ms > 0) {
                await context.sleep(
                    Math.min(plan.ms, Math.max(0, context.deadlineAt - context.clock())),
                );
            }
        }

        const result =
            current.kind === "delay"
                ? ({ kind: "continue", handle: "next" } as const)
                : current.kind === "httpRequest"
                  ? await runHttpRequest(current, context)
                  : runNode(current, context, log);

        trace.push({ nodeId: current.id, kind: current.kind, ms: context.clock() - startedAt });

        if (result.kind === "error") {
            return { ok: false, reason: result.reason, nodeId: current.id, trace, log };
        }

        if (result.kind === "respond") {
            if (byteLength(result.response.body) > MAX_RESPONSE_BYTES) {
                return { ok: false, reason: "response_too_large", nodeId: current.id, trace, log };
            }

            return { ok: true, response: result.response, trace, log };
        }

        const edge = graph.edges.find(
            (candidate) =>
                candidate.source === current?.id && candidate.sourceHandle === result.handle,
        );

        if (edge === undefined) {
            return { ok: false, reason: "no_response_on_path", nodeId: current.id, trace, log };
        }

        current = byId.get(edge.target);
    }

    return { ok: false, reason: "no_response_on_path", trace, log };
}

/** A HEAD answer: every header the GET would carry, and no bytes. */
export function withoutBody(response: MockResponse): MockResponse {
    return { ...response, body: "" };
}
