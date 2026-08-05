import { checkAuth, isAuthMode, type AuthConfig } from "./auth-check";
import { compareValues, isCompareOp, pickWeighted } from "./compare";
import { MAX_DELAY_MS } from "./constants";
import { randomBranches, switchCases } from "./node-registry";
import { resolveValue } from "./values";
import type { ExecutionContext, GraphNode, JsonValue, NodeResult, ValueExpr } from "../types/graph";

/**
 * What each logic node does when execution reaches it.
 *
 * Kept apart from `execute.ts` so the loop — budgets, tracing, edge following —
 * stays one readable page while the behaviour of eleven node kinds lives here.
 * Every function is pure over the injected context, so each is unit-tested
 * without a graph, a request or a clock.
 *
 * The shared shape is that **stored data is JSONB and every read of it has to
 * survive nonsense**. A node written by an older build, hand-edited through the
 * API, or half-configured in the UI must degrade to something sensible rather
 * than throw — so each reader below takes a default.
 */

function asRecord(value: unknown): Record<string, JsonValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, JsonValue>)
        : {};
}

function readString(data: Record<string, JsonValue>, key: string, fallback = ""): string {
    const value = data[key];

    return typeof value === "string" ? value : fallback;
}

function readNumber(data: Record<string, JsonValue>, key: string, fallback: number): number {
    const value = data[key];

    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A stored `ValueExpr`, or null when the stored value is not one. */
function asValueExpr(value: JsonValue): ValueExpr | null {
    return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value
        ? (value as unknown as ValueExpr)
        : null;
}

/** A stored `ValueExpr`, or a literal empty string when it is not one. */
function readValueExpr(data: Record<string, JsonValue>, key: string): ValueExpr {
    return asValueExpr(data[key]) ?? { kind: "static", value: "" };
}

export function runAuth(node: GraphNode, context: ExecutionContext): NodeResult {
    const data = asRecord(node.data);
    const mode = readString(data, "mode", "none");

    const config: AuthConfig = {
        mode: isAuthMode(mode) ? mode : "none",
        header: readString(data, "header", "x-api-key"),
        value: readString(data, "value"),
    };

    // Two handles rather than an immediate 401, so the author decides what a
    // refusal looks like. A mock whose failure path is hard-coded cannot model
    // an API that answers 403 with a body, which is most of them.
    return { kind: "continue", handle: checkAuth(config, context.request) ? "pass" : "fail" };
}

export function runCondition(node: GraphNode, context: ExecutionContext): NodeResult {
    const data = asRecord(node.data);
    const op = readString(data, "op", "equals");

    const left = resolveValue(readValueExpr(data, "left"), context);
    const right = resolveValue(readValueExpr(data, "right"), context);

    if (!left.ok) {
        return { kind: "error", reason: left.reason };
    }

    if (!right.ok) {
        return { kind: "error", reason: right.reason };
    }

    const outcome = compareValues(left.value, isCompareOp(op) ? op : "equals", right.value);

    return { kind: "continue", handle: outcome ? "true" : "false" };
}

export function runSwitch(node: GraphNode, context: ExecutionContext): NodeResult {
    const data = asRecord(node.data);
    const operand = resolveValue(readValueExpr(data, "operand"), context);

    if (!operand.ok) {
        return { kind: "error", reason: operand.reason };
    }

    for (const entry of switchCases(data)) {
        // A case may carry a full expression, or nothing — in which case the
        // label is compared as a literal, so the simple "match this word" case
        // needs no second field in the UI.
        const match = resolveValue(
            asValueExpr(entry.match) ?? { kind: "static", value: entry.label },
            context,
        );

        if (match.ok && compareValues(operand.value, "equals", match.value)) {
            return { kind: "continue", handle: `case:${entry.id}` };
        }
    }

    return { kind: "continue", handle: "default" };
}

export type DelayPlan = {
    /** Milliseconds to wait, already clamped. */
    readonly ms: number;
    readonly handle: string;
};

/**
 * How long a delay node waits.
 *
 * Pure: it returns the duration rather than sleeping, so the executor owns the
 * one `await` and a test never has to wait. Clamped to `MAX_DELAY_MS` because
 * an uncapped delay is the cheapest way to exhaust a deployment's concurrency —
 * ten thousand requests holding a thirty-second sleep is a denial of service
 * somebody can configure through a form.
 */
export function planDelay(node: GraphNode, context: ExecutionContext): DelayPlan {
    const data = asRecord(node.data);
    const min = readNumber(data, "min", Number.NaN);
    const max = readNumber(data, "max", Number.NaN);

    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
        const jitter = min + context.random() * (max - min);

        return { ms: clampDelay(jitter), handle: "next" };
    }

    return { ms: clampDelay(readNumber(data, "ms", 0)), handle: "next" };
}

function clampDelay(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }

    return Math.min(Math.round(value), MAX_DELAY_MS);
}

export function runRandomBranch(node: GraphNode, context: ExecutionContext): NodeResult {
    const branches = randomBranches(asRecord(node.data));
    const chosen = pickWeighted(branches, context.random());

    if (chosen === undefined) {
        // No branches configured. `validateGraph` catches this at save; at
        // runtime the honest answer is that this path leads nowhere.
        return { kind: "error", reason: "no_response_on_path" };
    }

    return { kind: "continue", handle: `branch:${chosen.id}` };
}

export function runSetVariable(node: GraphNode, context: ExecutionContext): NodeResult {
    const data = asRecord(node.data);
    const name = readString(data, "name").trim();

    if (name === "") {
        // A nameless variable is a no-op rather than a failure: the field is
        // blank the moment the node is placed, and refusing to run would mean
        // the graph breaks before the author has finished typing.
        return { kind: "continue", handle: "next" };
    }

    const value = resolveValue(readValueExpr(data, "value"), context);

    if (!value.ok) {
        return { kind: "error", reason: value.reason };
    }

    // The one mutation in the whole executor, and it is why `vars` is the only
    // mutable field on the context.
    context.vars[name] = value.value;

    return { kind: "continue", handle: "next" };
}

export type LogLine = {
    readonly level: "debug" | "info" | "warn";
    readonly message: string;
};

/**
 * A log node's line, returned rather than written.
 *
 * The executor collects these into the trace, so a log inside a mock ends up in
 * the studio's own trace panel and never in the server's stdout — a visitor's
 * mock must not be able to write arbitrary text into this deployment's logs,
 * which is a log-injection surface as well as a noise one.
 */
export function readLogLine(node: GraphNode, context: ExecutionContext): LogLine | null {
    const data = asRecord(node.data);
    const level = readString(data, "level", "info");
    const message = resolveValue(readValueExpr(data, "message"), context);

    if (!message.ok) {
        return null;
    }

    return {
        level: level === "debug" || level === "warn" ? level : "info",
        message:
            typeof message.value === "string"
                ? message.value
                : JSON.stringify(message.value ?? null),
    };
}

/**
 * `transform` is declared and deliberately not implemented.
 *
 * Every operation it was sketched with — pick, omit, rename, map — is already
 * expressible in the Response Builder, which is a better place for it: a
 * visible tree beats an invisible pipeline. It stays in the union so a stored
 * graph naming it still reads, and `validateGraph` says plainly that it cannot
 * run rather than letting it silently pass values through.
 */
export function runTransform(): NodeResult {
    return { kind: "error", reason: "unsupported_node" };
}

/**
 * An outbound request from inside a graph.
 *
 * Refuses outright when no `outbound` function was injected, which is the
 * default: a context built without one simply cannot reach the network, so the
 * SSRF surface is closed by construction rather than by a flag somebody could
 * forget to set. Everything about *which* addresses are permissible lives in
 * `repository/outbound.ts` behind that function — `domain/` never opens a
 * socket and never learns an IP.
 */
export async function runHttpRequest(
    node: GraphNode,
    context: ExecutionContext,
): Promise<NodeResult> {
    if (context.outbound === undefined) {
        return { kind: "error", reason: "unsupported_node" };
    }

    const data = asRecord(node.data);
    const url = resolveValue(readValueExpr(data, "url"), context);

    if (!url.ok) {
        return { kind: "error", reason: url.reason };
    }

    const bodyExpr = data.body === undefined ? null : readValueExpr(data, "body");
    const body = bodyExpr === null ? null : resolveValue(bodyExpr, context);

    if (body !== null && !body.ok) {
        return { kind: "error", reason: body.reason };
    }

    const result = await context.outbound({
        url: typeof url.value === "string" ? url.value : String(url.value ?? ""),
        method: readString(data, "method", "GET"),
        headers: readHeaderMap(data),
        body: body === null ? null : serialiseOutboundBody(body.value),
    });

    // Both outcomes continue rather than failing the graph: an author who wired
    // the `error` handle wants to model what their app does when the upstream is
    // down, and a node that killed the request instead would make that
    // unmodellable.
    const saveAs = readString(data, "saveAs").trim();

    if (result.ok) {
        if (saveAs !== "") {
            context.vars[saveAs] = result.body;
        }

        return { kind: "continue", handle: "ok" };
    }

    if (saveAs !== "") {
        context.vars[saveAs] = { error: result.reason };
    }

    return { kind: "continue", handle: "error" };
}

function readHeaderMap(data: Record<string, JsonValue>): Record<string, string> {
    const rows = data.headers;

    if (!Array.isArray(rows)) {
        return {};
    }

    const out: Record<string, string> = {};

    for (const entry of rows) {
        const row = asRecord(entry);

        if (typeof row.name === "string" && typeof row.value === "string") {
            out[row.name] = row.value;
        }
    }

    return out;
}

function serialiseOutboundBody(value: JsonValue): string | null {
    if (value === null || value === "") {
        return null;
    }

    return typeof value === "string" ? value : JSON.stringify(value);
}
