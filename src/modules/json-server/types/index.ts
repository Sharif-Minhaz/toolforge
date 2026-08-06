import type {
    DocumentFailure,
    DocumentUsage,
    JsonDocument,
    ResourceKind,
    ResourceSummary,
} from "@/modules/tools/types/json-document";

/**
 * Everything the JSON Server Studio names, as types.
 *
 * The document model itself — `JsonValue`, the resource kinds, how reading one
 * can fail — lives in `tools/types/json-document.ts`, shared with the GraphQL
 * Server Studio. What is here is everything about serving that document *as
 * REST*: methods, derived routes, the engine's request and outcome, and the
 * studio's own view of a server.
 */

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** One published route, derived from the document rather than authored. */
export type DerivedRoute = {
    readonly method: HttpMethod;
    /** `/posts`, `/posts/:id`, `/profile`. */
    readonly pattern: string;
    readonly resource: string;
    /**
     * What the resource turned out to be. Carried on the route rather than
     * looked up again by the UI, because `GET /posts` and `GET /profile` are
     * different sentences and the pattern alone cannot tell them apart.
     */
    readonly kind: ResourceKind;
    /** Whether this route writes, which is what the size lock refuses. */
    readonly writes: boolean;
};

// ─── Serving ────────────────────────────────────────────────────────────────

/** A request as the pure engine sees it: no `Request`, no headers, no host. */
export type ServeRequest = {
    readonly method: HttpMethod;
    /** Path below the server key, always starting with `/`. */
    readonly path: string;
    /** Decoded query pairs, repeated keys kept — `?id=1&id=2` is meaningful. */
    readonly query: readonly (readonly [string, string])[];
    /** Raw request body. Empty for methods that carry none. */
    readonly body: string;
};

export const SERVE_ERRORS = [
    "not_found",
    "method_not_allowed",
    "invalid_json_body",
    "body_not_an_object",
    "duplicate_id",
    "document_full",
    "too_many_items",
    "invalid_query",
    "payload_too_large",
] as const;

export type ServeError = (typeof SERVE_ERRORS)[number];

/**
 * What the engine decided, with the next document when it changed one.
 *
 * `document` being `null` is the signal the repository reads to skip the row
 * lock entirely: a `GET` is answered from a plain read, and only a write pays
 * for a transaction.
 */
export type ServeOutcome = {
    readonly status: number;
    /** Already serialised, so the caller never re-encodes what it just built. */
    readonly body: string;
    /** Non-security headers this response needs — `Allow`, `Location`, `X-Total-Count`. */
    readonly headers: readonly (readonly [string, string])[];
    /** The document to store, or `null` when nothing changed. */
    readonly document: JsonDocument | null;
    /** Bytes of the document to store. Zero when nothing changed. */
    readonly bytes: number;
};

// ─── The studio's view of a server ──────────────────────────────────────────

export type JsonServerSummary = {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly isPaused: boolean;
    readonly usage: DocumentUsage;
    readonly resourceCount: number;
    readonly recordCount: number;
    /** ISO-8601; every one of these crosses a Server Action boundary. */
    readonly createdAt: string;
    readonly updatedAt: string;
};

export type JsonServerDetail = JsonServerSummary & {
    /** The live document, as canonical text for the editor. */
    readonly document: string;
    readonly resources: readonly ResourceSummary[];
    readonly routes: readonly DerivedRoute[];
};

export type RequestLogRow = {
    readonly id: string;
    readonly method: string;
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
    readonly createdAt: string;
};

export type ServerOverview = {
    readonly servers: readonly JsonServerSummary[];
    readonly canCreate: boolean;
    readonly maxServers: number;
    readonly isStorageConfigured: boolean;
};

// ─── Action results ─────────────────────────────────────────────────────────

export const ACTION_PROBLEMS = [
    "invalid_name",
    "invalid_key",
    "key_taken",
    "storage_unavailable",
    "cookie_full",
    "challenge_failed",
    "quota_exhausted",
    "write_failed",
    "not_owner",
    "not_found",
    "invalid_recovery_key",
    "unknown_recovery_key",
] as const;

export type ActionProblem = (typeof ACTION_PROBLEMS)[number];

export type ActionResult =
    { readonly ok: true } | { readonly ok: false; readonly reason: ActionProblem };

export type CreateResult =
    | {
          readonly ok: true;
          readonly server: JsonServerSummary;
          /** Shown once, never stored unhashed, never shown again. */
          readonly recoveryKey: string;
      }
    | { readonly ok: false; readonly reason: ActionProblem }
    | DocumentFailure;

export type ImportResult =
    | { readonly ok: true; readonly server: JsonServerSummary }
    | { readonly ok: false; readonly reason: ActionProblem };

export type RotateRecoveryResult =
    | { readonly ok: true; readonly recoveryKey: string }
    | { readonly ok: false; readonly reason: ActionProblem };

export type ReplaceDocumentResult =
    | { readonly ok: true; readonly detail: JsonServerDetail }
    | { readonly ok: false; readonly reason: ActionProblem }
    | DocumentFailure;
