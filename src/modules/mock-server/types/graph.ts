/**
 * The endpoint graph, the values inside it, and what executing one produces.
 *
 * Declared whole here even though M1 implements only two node kinds and one
 * value kind. The unions are the contract the studio, the validator and the
 * executor all read, and widening a union later is additive; discovering
 * halfway through M3 that `NodeKind` was never a union is not.
 *
 * See `docs/mock-server-studio.md` §5 and §6.
 */

/** Methods a mock endpoint can answer. Mirrors the Prisma `HttpMethod` enum. */
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Every node the canvas will ever place. Only `request` and `response` execute
 * today; the rest are rejected by `validateGraph` with a reason naming the
 * milestone, rather than silently doing nothing at runtime.
 */
export const NODE_KINDS = [
    "request",
    "auth",
    "condition",
    "switch",
    "delay",
    "randomBranch",
    "setVariable",
    "transform",
    "log",
    "httpRequest",
    "response",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** The kinds `executeGraph` can actually run right now. */
export const IMPLEMENTED_NODE_KINDS = [
    "request",
    "response",
] as const satisfies readonly NodeKind[];

export type ImplementedNodeKind = (typeof IMPLEMENTED_NODE_KINDS)[number];

/** Anything JSON can hold. The hub value every codec and node passes around. */
export type JsonValue =
    string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Where a value in a response comes from.
 *
 * Declared in full; `resolveValue` implements `static` and reports every other
 * kind as unsupported until M2 builds the picker that produces them. The
 * recursion in `object` and `array` is what makes arbitrary nesting free once
 * the tree editor exists.
 */
export type ValueExpr =
    | { readonly kind: "static"; readonly value: JsonValue }
    | { readonly kind: "request"; readonly source: RequestSource; readonly path: string }
    | { readonly kind: "env"; readonly key: string }
    | { readonly kind: "var"; readonly name: string }
    | { readonly kind: "faker"; readonly fn: string; readonly args?: JsonValue }
    | { readonly kind: "uuid" }
    | { readonly kind: "now"; readonly format: "iso" | "epochMs" | "epochSeconds" }
    | { readonly kind: "template"; readonly parts: readonly (string | ValueExpr)[] }
    | { readonly kind: "object"; readonly fields: readonly ObjectField[] }
    | { readonly kind: "array"; readonly of: ValueExpr; readonly count: CountExpr }
    | { readonly kind: "oneOf"; readonly options: readonly ValueExpr[] };

/** The tags of `ValueExpr`, as a runtime list so a stored value can be checked. */
export const VALUE_KINDS = [
    "static",
    "request",
    "env",
    "var",
    "faker",
    "uuid",
    "now",
    "template",
    "object",
    "array",
    "oneOf",
] as const;

export type ValueKind = (typeof VALUE_KINDS)[number];

/**
 * The kinds `resolveValue` can produce a result for.
 *
 * All of them, as of M2. `faker` is listed because the expression is
 * resolvable — whether a given *context* can resolve it depends on the injected
 * provider, which is a runtime question and not a shape one.
 */
export const IMPLEMENTED_VALUE_KINDS = VALUE_KINDS;

export type RequestSource = "body" | "header" | "cookie" | "query" | "param";

export type ObjectField = {
    readonly key: string;
    readonly value: ValueExpr;
};

export type CountExpr =
    | { readonly kind: "fixed"; readonly n: number }
    | { readonly kind: "range"; readonly min: number; readonly max: number };

export type HeaderRow = {
    readonly name: string;
    readonly value: string;
};

/** The entry anchor. Carries no configuration — it is where execution starts. */
export type RequestNodeData = Record<string, never>;

export type ResponseNodeData = {
    readonly status: number;
    readonly contentType: string;
    readonly headers: readonly HeaderRow[];
    readonly body: ValueExpr;
};

export type GraphNode =
    | {
          readonly id: string;
          readonly kind: "request";
          readonly position: NodePosition;
          readonly data: RequestNodeData;
      }
    | {
          readonly id: string;
          readonly kind: "response";
          readonly position: NodePosition;
          readonly data: ResponseNodeData;
      }
    | {
          readonly id: string;
          readonly kind: Exclude<NodeKind, ImplementedNodeKind>;
          readonly position: NodePosition;
          readonly data: Record<string, JsonValue>;
      };

export type NodePosition = {
    readonly x: number;
    readonly y: number;
};

export type GraphEdge = {
    readonly id: string;
    readonly source: string;
    /** `"next"`, `"true"`, `"false"`, `` `case:${string}` `` … */
    readonly sourceHandle: string;
    readonly target: string;
};

/**
 * What lives in `Endpoint.graph`.
 *
 * `schemaVersion` is the whole reason a graph saved today keeps executing after
 * the node set moves on: `migrateGraph` walks a document forward on read, and
 * the next save writes the new shape back.
 */
export type GraphDocument = {
    readonly schemaVersion: 1;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly viewport?: NodePosition & { readonly zoom: number };
};

export const GRAPH_SCHEMA_VERSION = 1;

/** How a graph can be unusable. Reported at save, never discovered at runtime. */
export const GRAPH_PROBLEM_REASONS = [
    "not_a_document",
    "unknown_schema_version",
    "no_request_node",
    "many_request_nodes",
    "no_response_node",
    "unreachable_node",
    "path_without_response",
    "cycle",
    "unknown_handle",
    "unsupported_node",
    "unsupported_value",
    "unsupported_content_type",
    "invalid_status",
    "value_too_deep",
] as const;

export type GraphProblemReason = (typeof GRAPH_PROBLEM_REASONS)[number];

export type GraphProblem = {
    readonly reason: GraphProblemReason;
    /** Which node raised it, when one can be pinpointed. */
    readonly nodeId?: string;
};

export type GraphValidation =
    | { readonly ok: true; readonly graph: GraphDocument }
    | { readonly ok: false; readonly problems: readonly GraphProblem[] };

/** The request, normalised, as every node reads it. */
export type NormalizedRequest = {
    readonly method: HttpMethod;
    /** Normalised path, no query string, no trailing slash. */
    readonly path: string;
    /** Extracted from `:name` segments and the `*` tail. */
    readonly params: Readonly<Record<string, string>>;
    readonly query: Readonly<Record<string, string>>;
    /** Lower-cased names, as HTTP defines them. */
    readonly headers: Readonly<Record<string, string>>;
    readonly cookies: Readonly<Record<string, string>>;
    /** Parsed when the content type says JSON, otherwise the raw text. */
    readonly body: JsonValue;
};

export type MockResponse = {
    readonly status: number;
    readonly headers: readonly HeaderRow[];
    readonly body: string;
};

export const EXECUTION_ERROR_REASONS = [
    "graph_invalid",
    "no_entry_node",
    "no_response_on_path",
    "step_budget_exceeded",
    "deadline_exceeded",
    "value_depth_exceeded",
    "response_too_large",
    "unsupported_node",
    "unsupported_value",
] as const;

export type ExecutionErrorReason = (typeof EXECUTION_ERROR_REASONS)[number];

/** One line of the trace panel: which node ran, and for how long. */
export type TraceEntry = {
    readonly nodeId: string;
    readonly kind: NodeKind;
    readonly ms: number;
};

/** What a `log` node produced, collected rather than written to stdout. */
export type ExecutionLogLine = {
    readonly level: "debug" | "info" | "warn";
    readonly message: string;
};

export type ExecutionResult =
    | {
          readonly ok: true;
          readonly response: MockResponse;
          readonly trace: readonly TraceEntry[];
          readonly log: readonly ExecutionLogLine[];
      }
    | {
          readonly ok: false;
          readonly reason: ExecutionErrorReason;
          readonly nodeId?: string;
          readonly trace: readonly TraceEntry[];
          readonly log: readonly ExecutionLogLine[];
      };

/**
 * Everything a node may read or touch, all of it injected.
 *
 * `clock` and `random` are parameters rather than globals so the whole executor
 * is testable without a fake timer, and so the reproducibility invariant in
 * §6.2 — same graph, same request, same seed, identical bytes — is something a
 * test can actually assert.
 */
export type ExecutionContext = {
    readonly request: NormalizedRequest;
    readonly env: Readonly<Record<string, string>>;
    /**
     * Monotonic, for the deadline. Not a wall clock: `performance.now()` on the
     * server, a counter in a test, and neither is a date anybody can render.
     */
    readonly clock: () => number;
    /** Epoch milliseconds — what a `now` value expression renders. */
    readonly now: () => number;
    /** Seeded. See `domain/seeded-random.ts` for why it is never `Math.random`. */
    readonly random: () => number;
    /**
     * Fake data, injected rather than imported.
     *
     * `@faker-js/faker` is roughly three megabytes and `domain/` is reachable
     * from the client bundle, so a static import here would ship it to every
     * visitor of every tool on the site. The provider is wired in by a
     * server-only module, and a context without one simply cannot resolve
     * `faker` values — which is exactly what a preview running somewhere
     * without it should do.
     */
    readonly faker?: (id: string, random: () => number) => JsonValue;
    /**
     * How a `delay` node waits. Injected so a test resolves instantly and the
     * executor never reaches for a global timer.
     */
    readonly sleep: (ms: number) => Promise<void>;
    /**
     * How an `httpRequest` node reaches the network — absent unless the caller
     * wired one in, which is what keeps the whole SSRF surface unreachable by
     * default. The guard stack lives behind it in
     * `repository/outbound.ts`; `domain/` never opens a socket.
     */
    readonly outbound?: (input: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body: string | null;
    }) => Promise<
        | { ok: true; status: number; headers: Record<string, string>; body: JsonValue }
        | { ok: false; reason: string }
    >;
    readonly deadlineAt: number;
    vars: Record<string, JsonValue>;
};

export type NodeResult =
    | { readonly kind: "continue"; readonly handle: string }
    | { readonly kind: "respond"; readonly response: MockResponse }
    | { readonly kind: "error"; readonly reason: ExecutionErrorReason };
