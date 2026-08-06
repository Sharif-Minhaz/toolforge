/**
 * Everything the JSON Server Studio names, as types.
 *
 * The data model is deliberately `JsonValue` — a plain JavaScript value — and
 * not the positioned tree `tools/types/json-tree.ts` describes. That tree exists
 * so a *human* pasting a document can be told which line is wrong; once the
 * document is stored, what the engine manipulates is data, and carrying source
 * positions through every sort, filter and merge would be carrying a fact about
 * a text nobody has any more.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** The whole `db.json`: top-level keys mapping to collections or single objects. */
export type JsonDocument = JsonObject;

/**
 * What a top-level key turned out to be.
 *
 * `collection` is an array of objects and gets the six CRUD routes.
 * `singular` is a lone object and gets three — `json-server` has no way to
 * `POST` to something that is not a list, and no id to `DELETE` by.
 * `opaque` is anything else: a top-level string, number, or an array of
 * scalars. It is stored and served on `GET` and nothing more, because
 * "record 3 of `[1,2,3]`" is not a thing with an identity.
 */
export const RESOURCE_KINDS = ["collection", "singular", "opaque"] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type ResourceSummary = {
    readonly name: string;
    readonly kind: ResourceKind;
    /** Records, for a collection. Zero for anything else. */
    readonly count: number;
    /**
     * False when the key cannot appear in a URL as written — see
     * `RESOURCE_NAME_PATTERN`. Such a key is kept in the document and served
     * inside its parent, but publishes no routes of its own, and the studio
     * says which ones those are rather than leaving a resource that silently
     * 404s.
     */
    readonly routable: boolean;
    /** Keys seen across the collection's records, for the studio's route hints. */
    readonly fields: readonly string[];
};

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

/**
 * How reading a document somebody supplied can fail.
 *
 * Every member is a message key in both catalogues. `position` is set only for
 * failures the parser could pinpoint, which is why it is optional rather than a
 * zero — a zero would render as "line 0".
 */
export const DOCUMENT_PROBLEMS = [
    "empty",
    "invalid_json",
    "not_an_object",
    "too_large",
    "too_deep",
    "too_many_collections",
    "too_many_items",
    "item_not_an_object",
    "duplicate_id",
] as const;

export type DocumentProblem = (typeof DOCUMENT_PROBLEMS)[number];

export type DocumentFailure = {
    readonly ok: false;
    readonly reason: DocumentProblem;
    /** 1-based line and column, when the failure is a syntax one. */
    readonly line?: number;
    readonly column?: number;
    /** The resource a structural failure was found in. */
    readonly resource?: string;
};

export type DocumentResult =
    | {
          readonly ok: true;
          readonly document: JsonDocument;
          /** Canonical text of `document`, which is what gets measured and stored. */
          readonly text: string;
          readonly bytes: number;
          readonly resources: readonly ResourceSummary[];
          /**
           * Ids this reader had to invent because a record arrived without one.
           * Reported rather than silently done: a fixture whose ids changed
           * under it is a surprise worth one line of copy.
           */
          readonly generatedIds: number;
          /**
           * Ids coerced from a number to a string. `json-server` v1 made ids
           * strings, and a document written for v0 hits this on every record.
           */
          readonly coercedIds: number;
      }
    | DocumentFailure;

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

export type ServerUsage = {
    readonly bytes: number;
    readonly limit: number;
    /** 0–100, rounded, so the bar and the label cannot disagree. */
    readonly percent: number;
    /** True past `DOCUMENT_WARN_RATIO`; the bar changes tone and the copy warns. */
    readonly nearLimit: boolean;
    /** True at the ceiling. Writes are refused until something is deleted. */
    readonly full: boolean;
};

export type JsonServerSummary = {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly isPaused: boolean;
    readonly usage: ServerUsage;
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
