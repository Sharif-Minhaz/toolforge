import { DEFAULT_CONTENT_TYPE } from "./content-type";
import { DEFAULT_RESPONSE_BODY } from "./value-edit";
import {
    NODE_KINDS,
    REQUEST_SOURCES,
    type GraphNode,
    type JsonValue,
    type NodeKind,
    type RequestSource,
} from "../types/graph";

/**
 * What each node kind is, as data.
 *
 * The plugin seam the brief asked for — *"future nodes should be easy to
 * register"* — and it is deliberately two registries rather than one. This is
 * the framework-free half: which handles a node has, what its data starts as,
 * whether it can terminate a path. The client half (`components/nodes/`) holds
 * the icon and the inspector, keyed by the same `NodeKind` union.
 *
 * Adding a node is: widen `NODE_KINDS`, add an entry here, add an entry in the
 * client registry, add two message keys per locale, and teach `runNode` to
 * execute it. Nothing else in the application changes — not the canvas, not the
 * validator, not the executor's loop.
 */

/**
 * What a handle can be called. A literal union, not a string, because each one
 * becomes the message key `mockServer.handles.<labelKey>` and a plain `string`
 * would defeat the check that keeps both catalogues in step.
 */
export const HANDLE_LABEL_KEYS = [
    "next",
    "pass",
    "fail",
    "true",
    "false",
    "case",
    "default",
    "branch",
    "ok",
    "error",
] as const;

export type HandleLabelKey = (typeof HANDLE_LABEL_KEYS)[number];

/** A named output. An edge leaves a node through exactly one of these. */
export type NodeHandle = {
    readonly id: string;
    readonly labelKey: HandleLabelKey;
};

export type NodeDefinition = {
    readonly kind: NodeKind;
    /** How many edges may arrive. The entry node accepts none. */
    readonly acceptsInput: boolean;
    /** Computed from data, because a switch has one handle per case. */
    readonly handles: (data: Record<string, JsonValue>) => readonly NodeHandle[];
    readonly defaults: () => Record<string, JsonValue>;
    /**
     * Whether execution stops here.
     *
     * Declared rather than derived from `handles`. Deriving it looked tidy and
     * was wrong: a `randomBranch` whose branches have all been deleted has no
     * handles either, and would have read as a second terminal kind.
     */
    readonly terminal: boolean;
    /** False while a kind is declared but not yet executable. */
    readonly implemented: boolean;
    /** A node the reader may drag onto the canvas. */
    readonly placeable: boolean;
    readonly accent: "violet" | "cyan" | "amber" | "rose" | "emerald";
};

/**
 * Where a `validate` node files the names it found missing.
 *
 * A variable rather than a fixed response, so the 400 the author wires to the
 * fail handle can say *which* field was absent — `{ kind: "var", name: "missing" }`
 * in the response body is the whole difference between a mock that reproduces
 * an API's error and one that just refuses.
 */
export const DEFAULT_MISSING_VARIABLE = "missing";

const NEXT: readonly NodeHandle[] = [{ id: "next", labelKey: "next" }];

const NONE: readonly NodeHandle[] = [];

function asRecord(data: unknown): Record<string, JsonValue> {
    return typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, JsonValue>)
        : {};
}

export type SwitchCase = {
    readonly id: string;
    readonly label: string;
    /** What the operand is compared against. A `ValueExpr`, when one is set. */
    readonly match: JsonValue;
};

/** A switch's cases, read defensively — stored data is JSONB. */
export function switchCases(data: Record<string, JsonValue>): readonly SwitchCase[] {
    const cases = data.cases;

    if (!Array.isArray(cases)) {
        return [];
    }

    return cases
        .map((entry) => {
            const row = asRecord(entry);

            return typeof row.id === "string"
                ? {
                      id: row.id,
                      label: typeof row.label === "string" ? row.label : row.id,
                      match: row.match ?? null,
                  }
                : null;
        })
        .filter((entry): entry is SwitchCase => entry !== null);
}

/** One thing a `validate` node insists a request carries. */
export type RequiredField = {
    readonly id: string;
    readonly source: RequestSource;
    /** A header name, a query key, a path parameter, or a path into the body. */
    readonly path: string;
};

function isRequestSource(value: unknown): value is RequestSource {
    return typeof value === "string" && (REQUEST_SOURCES as readonly string[]).includes(value);
}

/**
 * A validate node's field list, read defensively — stored data is JSONB.
 *
 * A row naming a source this build does not know is dropped rather than
 * defaulted to `body`: a check against the wrong half of the request would
 * refuse requests that are perfectly valid, and silently.
 */
export function requiredFields(data: Record<string, JsonValue>): readonly RequiredField[] {
    const fields = data.fields;

    if (!Array.isArray(fields)) {
        return [];
    }

    return fields
        .map((entry) => {
            const row = asRecord(entry);

            return typeof row.id === "string" &&
                isRequestSource(row.source) &&
                typeof row.path === "string"
                ? { id: row.id, source: row.source, path: row.path }
                : null;
        })
        .filter((entry): entry is RequiredField => entry !== null);
}

/** The same for a weighted branch. */
export function randomBranches(
    data: Record<string, JsonValue>,
): readonly { id: string; label: string; weight: number }[] {
    const branches = data.branches;

    if (!Array.isArray(branches)) {
        return [];
    }

    return branches
        .map((entry) => {
            const row = asRecord(entry);

            return typeof row.id === "string"
                ? {
                      id: row.id,
                      label: typeof row.label === "string" ? row.label : row.id,
                      weight: typeof row.weight === "number" ? row.weight : 1,
                  }
                : null;
        })
        .filter((entry): entry is { id: string; label: string; weight: number } => entry !== null);
}

export const NODE_DEFINITIONS: Readonly<Record<NodeKind, NodeDefinition>> = {
    request: {
        kind: "request",
        acceptsInput: false,
        terminal: false,
        handles: () => NEXT,
        defaults: () => ({}),
        implemented: true,
        // Exactly one exists and it is created with the graph, so it is never
        // in the palette — a second entry point is a graph with no meaning.
        placeable: false,
        accent: "cyan",
    },
    auth: {
        kind: "auth",
        acceptsInput: true,
        terminal: false,
        handles: () => [
            { id: "pass", labelKey: "pass" },
            { id: "fail", labelKey: "fail" },
        ],
        defaults: () => ({ mode: "apiKey", header: "x-api-key", value: "", status: 401 }),
        implemented: true,
        placeable: true,
        accent: "rose",
    },
    validate: {
        kind: "validate",
        acceptsInput: true,
        terminal: false,
        // The same two handles `auth` has, and for the same reason: what a
        // refusal looks like is the author's decision. An API that answers 400
        // with a body naming the field is the common case and a hard-coded
        // status could not model it.
        handles: () => [
            { id: "pass", labelKey: "pass" },
            { id: "fail", labelKey: "fail" },
        ],
        defaults: () => ({ fields: [], saveAs: DEFAULT_MISSING_VARIABLE }),
        implemented: true,
        placeable: true,
        accent: "rose",
    },
    condition: {
        kind: "condition",
        acceptsInput: true,
        terminal: false,
        handles: () => [
            { id: "true", labelKey: "true" },
            { id: "false", labelKey: "false" },
        ],
        defaults: () => ({
            left: { kind: "request", source: "body", path: "" },
            op: "equals",
            right: { kind: "static", value: "" },
        }),
        implemented: true,
        placeable: true,
        accent: "amber",
    },
    switch: {
        kind: "switch",
        acceptsInput: true,
        terminal: false,
        handles: (data) => [
            ...switchCases(data).map((entry) => ({
                id: `case:${entry.id}`,
                labelKey: "case" as const,
            })),
            { id: "default", labelKey: "default" },
        ],
        defaults: () => ({ operand: { kind: "request", source: "body", path: "" }, cases: [] }),
        implemented: true,
        placeable: true,
        accent: "amber",
    },
    delay: {
        kind: "delay",
        acceptsInput: true,
        terminal: false,
        handles: () => NEXT,
        defaults: () => ({ ms: 250 }),
        implemented: true,
        placeable: true,
        accent: "violet",
    },
    randomBranch: {
        kind: "randomBranch",
        acceptsInput: true,
        terminal: false,
        handles: (data) =>
            randomBranches(data).map((entry) => ({
                id: `branch:${entry.id}`,
                labelKey: "branch" as const,
            })),
        defaults: () => ({
            branches: [
                { id: "a", label: "Success", weight: 80 },
                { id: "b", label: "Failure", weight: 20 },
            ],
        }),
        implemented: true,
        placeable: true,
        accent: "violet",
    },
    setVariable: {
        kind: "setVariable",
        acceptsInput: true,
        terminal: false,
        handles: () => NEXT,
        defaults: () => ({ name: "", value: { kind: "static", value: "" } }),
        implemented: true,
        placeable: true,
        accent: "emerald",
    },
    transform: {
        kind: "transform",
        acceptsInput: true,
        terminal: false,
        handles: () => NEXT,
        defaults: () => ({ source: "", target: "", ops: [] }),
        implemented: false,
        placeable: true,
        accent: "emerald",
    },
    log: {
        kind: "log",
        acceptsInput: true,
        terminal: false,
        handles: () => NEXT,
        defaults: () => ({ level: "info", message: { kind: "static", value: "" } }),
        implemented: true,
        placeable: true,
        accent: "cyan",
    },
    httpRequest: {
        kind: "httpRequest",
        acceptsInput: true,
        terminal: false,
        handles: () => [
            { id: "ok", labelKey: "ok" },
            { id: "error", labelKey: "error" },
        ],
        defaults: () => ({
            method: "GET",
            url: { kind: "static", value: "" },
            headers: [],
            saveAs: "response",
        }),
        implemented: true,
        // Placeable as of M8, and only because the guard stack it needs now
        // exists: `guardedFetch` resolves first and connects to the address it
        // checked, re-guards every redirect hop, caps the body while it streams,
        // and spends a fail-closed per-workspace quota. See
        // `docs/mock-server-studio.md` §11.
        placeable: true,
        accent: "rose",
    },
    response: {
        kind: "response",
        acceptsInput: true,
        terminal: true,
        // Terminal: execution stops here, so it has no outputs at all.
        handles: () => NONE,
        defaults: () => ({
            status: 200,
            contentType: DEFAULT_CONTENT_TYPE,
            headers: [],
            body: DEFAULT_RESPONSE_BODY as unknown as JsonValue,
        }),
        implemented: true,
        placeable: true,
        accent: "emerald",
    },
};

export function nodeDefinition(kind: NodeKind): NodeDefinition {
    return NODE_DEFINITIONS[kind];
}

/** Handles for a node as it is actually configured. */
export function handlesFor(node: GraphNode): readonly NodeHandle[] {
    return nodeDefinition(node.kind).handles(asRecord(node.data));
}

/** What the palette offers, in the order it reads best. */
export function placeableNodeKinds(): readonly NodeKind[] {
    return NODE_KINDS.filter((kind) => NODE_DEFINITIONS[kind].placeable);
}

export function isTerminalKind(kind: NodeKind): boolean {
    return NODE_DEFINITIONS[kind].terminal;
}
