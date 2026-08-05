import type { LoggedRequest, LoggedResponse, LoggedTrace } from "../domain/log-record";
import type { GraphDocument, ValueExpr } from "./graph";

/**
 * Shared shapes for the Visual Mock Server Studio.
 *
 * Literal unions live here so every message key built from one — a failure
 * reason rendered as `mock.errors.<reason>` — stays statically checkable.
 * See `docs/mock-server-studio.md` for the design these implement.
 */

/**
 * Everything that can go wrong on the way to owning or reaching a workspace.
 *
 * One flat union rather than a reason per action, because the UI renders them
 * all through the same strip and a reader does not care which action raised it.
 * Each maps to `mock.errors.<reason>` in both locales.
 */
export const WORKSPACE_FAILURE_REASONS = [
    /** No `DATABASE_URL`. The studio has nowhere to keep anything. */
    "storage_unavailable",
    /** No `MOCK_IP_SALT`. The limiter cannot run, so creation is refused. */
    "quota_not_configured",
    "quota_exhausted",
    "challenge_failed",
    /** This browser already holds the maximum number of workspaces. */
    "cookie_full",
    "invalid_name",
    /** Not sixteen Crockford characters — rejected before any query runs. */
    "invalid_recovery_key",
    /** Well-formed, but no workspace answers to it. */
    "unknown_recovery_key",
    "already_imported",
    /** The cookie carries no secret for the workspace being edited. */
    "not_owner",
    "not_found",
    "write_failed",
] as const;

export type WorkspaceFailureReason = (typeof WORKSPACE_FAILURE_REASONS)[number];

export type WorkspaceFailure = {
    readonly ok: false;
    readonly reason: WorkspaceFailureReason;
};

/**
 * A workspace as the navigation sees it.
 *
 * `createdAt` is an ISO-8601 string rather than a `Date` because this crosses a
 * Server Action boundary, and a `Date` that survives serialisation still has to
 * be formatted by the locale on the other side.
 */
export type WorkspaceSummary = {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly serverCount: number;
};

/**
 * What creation hands back. The recovery key appears here exactly once — it is
 * never stored in a readable form and can never be shown again.
 */
export type WorkspaceCreated = {
    readonly ok: true;
    readonly workspace: WorkspaceSummary;
    /** Already grouped for reading: `8QXK-H72D-9FLC-4M2P`. */
    readonly recoveryKey: string;
};

export type WorkspaceCreateResult = WorkspaceCreated | WorkspaceFailure;

export type WorkspaceImported = {
    readonly ok: true;
    readonly workspace: WorkspaceSummary;
};

export type WorkspaceImportResult = WorkspaceImported | WorkspaceFailure;

export type WorkspaceActionResult = { readonly ok: true } | WorkspaceFailure;

// ─── Servers, collections and endpoints ─────────────────────────────────────

export type ServerSummary = {
    readonly id: string;
    /** The public path segment: `/m/<key>/…`. */
    readonly key: string;
    readonly name: string;
    readonly description: string | null;
    readonly isPaused: boolean;
    readonly createdAt: string;
    readonly endpointCount: number;
};

export type CollectionNode = {
    readonly id: string;
    readonly parentId: string | null;
    readonly name: string;
    /** Materialised ancestor path, so a tree renders without a recursive query. */
    readonly path: string;
    readonly sortOrder: number;
};

export type EndpointSummary = {
    readonly id: string;
    readonly collectionId: string | null;
    readonly name: string;
    readonly method: string;
    readonly path: string;
    readonly isEnabled: boolean;
    /** The optimistic-concurrency token the editor sends back on save. */
    readonly version: number;
    readonly updatedAt: string;
};

/** Everything the server detail page renders, in one round trip. */
export type ServerDetail = ServerSummary & {
    readonly collections: readonly CollectionNode[];
    readonly endpoints: readonly EndpointSummary[];
};

/** One endpoint, opened for editing. Carries the graph's response settings. */
export type EndpointDetail = EndpointSummary & {
    readonly serverId: string;
    readonly status: number;
    readonly contentType: string;
    readonly headers: readonly { readonly name: string; readonly value: string }[];
    /** The response body as the tree editor holds it. */
    readonly body: ValueExpr;
    /**
     * The whole document, so the canvas and the response form edit one thing.
     * Two save paths over one row is how a graph and its response drift apart.
     */
    readonly graph: GraphDocument;
    /** Set when the stored graph could not be read as a response this build knows. */
    readonly graphProblem: string | null;
};

export const SERVER_FAILURE_REASONS = [
    "storage_unavailable",
    "not_owner",
    "not_found",
    "invalid_name",
    "invalid_key",
    "key_taken",
    "key_reserved",
    "server_limit_reached",
    "endpoint_limit_reached",
    "invalid_path",
    "route_taken",
    "invalid_status",
    "invalid_body",
    "invalid_content_type",
    "version_conflict",
    "write_failed",
] as const;

export type ServerFailureReason = (typeof SERVER_FAILURE_REASONS)[number];

export type ServerFailure = {
    readonly ok: false;
    readonly reason: ServerFailureReason;
};

export type ServerActionResult = { readonly ok: true } | ServerFailure;

export type CreateServerResult =
    { readonly ok: true; readonly server: ServerSummary } | ServerFailure;

export type EndpointResult =
    { readonly ok: true; readonly endpoint: EndpointDetail } | ServerFailure;

/** One row of the log table. */
export type RequestLogRow = {
    readonly id: string;
    readonly serverId: string;
    readonly endpointId: string | null;
    readonly method: string;
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
    readonly request: LoggedRequest;
    readonly response: LoggedResponse;
    readonly trace: LoggedTrace | null;
    readonly createdAt: string;
};

/** What the landing page renders before the visitor does anything. */
export type WorkspaceOverview = {
    readonly workspaces: readonly WorkspaceSummary[];
    /** False when this browser is already holding the maximum. */
    readonly canCreate: boolean;
    readonly maxWorkspaces: number;
    /** False when `DATABASE_URL` is absent — the studio says so and disables. */
    readonly isStorageConfigured: boolean;
};
