import type { DocumentFailure, DocumentUsage } from "@/modules/tools/types/json-document";

/**
 * Everything the GraphQL Server Studio names, as types.
 *
 * The document model itself — `JsonValue`, the resource kinds, how reading one
 * can fail — lives in `tools/types/json-document.ts`, shared with the JSON
 * Server Studio. What is here is everything about serving that document *as
 * GraphQL*: the derived schema, the request, the outcome, and the studio's own
 * view of a server.
 *
 * None of it mentions `graphql-js`. That is deliberate and load-bearing: the
 * schema *model* is plain data, so the studio can render it, `bun test` can
 * assert on it, and the reference implementation stays behind
 * `domain/execute.ts` where the client bundle never reaches it.
 */

// ─── The derived schema, as plain data ──────────────────────────────────────

/**
 * The scalars a JSON document can be described with.
 *
 * Five of the six are GraphQL's own built-ins, so the SDL this produces is
 * ordinary and every client, IDE and codegen tool already understands it.
 * `JSON` is the one custom scalar, and it exists because the JSON data model has
 * two shapes GraphQL's built-ins cannot name — an arbitrary nested object, and a
 * field whose type differs from record to record. Both are common in a real
 * fixture and neither is worth refusing a document over.
 */
export const GRAPHQL_SCALARS = ["ID", "String", "Int", "Float", "Boolean", "JSON"] as const;

export type GraphqlScalar = (typeof GRAPHQL_SCALARS)[number];

export type FieldType = {
    readonly scalar: GraphqlScalar;
    /** True when every observed value was an array. */
    readonly list: boolean;
    /** True when the field was absent or `null` in at least one record. */
    readonly nullable: boolean;
    /** True when a list contained a `null`. Meaningless unless `list`. */
    readonly itemsNullable: boolean;
};

export type FieldModel = {
    /** The published name, repaired to GraphQL's grammar and made unique. */
    readonly name: string;
    /** The key in the stored record, which may differ — `full-name` → `fullName`. */
    readonly sourceKey: string;
    readonly type: FieldType;
};

/**
 * A field derived from a foreign key rather than from a stored value.
 *
 * This is the whole reason to want GraphQL over the REST studio, so it is a
 * first-class part of the model rather than a decoration: `comments.postId`
 * pointing at a `posts` collection publishes `Comment.post: Post` **and**
 * `Post.comments: [Comment!]!`, and neither costs the caller a second request.
 */
export type RelationModel = {
    /** The published field name — `post`, or `comments`. */
    readonly name: string;
    /** Which way it points: `one` is the parent, `many` the children. */
    readonly cardinality: "one" | "many";
    /** The resource on the other end, by its `db.json` key. */
    readonly targetResource: string;
    /** That resource's type name, for the SDL. */
    readonly targetType: string;
    /** The record key holding the foreign key — always on the *child*. */
    readonly foreignKey: string;
};

export type ObjectModel = {
    /** The `db.json` key this came from. */
    readonly resource: string;
    /** `Post`. PascalCase, singular, unique. */
    readonly typeName: string;
    readonly fields: readonly FieldModel[];
    readonly relations: readonly RelationModel[];
};

/**
 * A collection: a type, a list field, a by-id field, a page envelope and four
 * mutations.
 */
export type CollectionModel = ObjectModel & {
    readonly kind: "collection";
    /** `posts` — the list field. */
    readonly listField: string;
    /** `post` — the single-record field. */
    readonly singleField: string;
    /** `postsConnection` — the counted, paged envelope. */
    readonly connectionField: string;
    readonly connectionType: string;
    readonly whereType: string;
    readonly orderByEnum: string;
    readonly createInput: string;
    readonly updateInput: string;
    readonly mutations: {
        readonly create: string;
        readonly update: string;
        readonly patch: string;
        readonly remove: string;
    };
    readonly recordCount: number;
};

/** A lone object: a type, one query field, and one replace mutation. */
export type SingularModel = ObjectModel & {
    readonly kind: "singular";
    readonly queryField: string;
    readonly updateInput: string;
    readonly mutations: { readonly update: string; readonly patch: string };
};

/**
 * Anything else — a top-level string, number, or array of scalars.
 *
 * Published as one `JSON` field and nothing more, for the same reason the REST
 * studio gives it `GET` alone: `record 3 of ["a","b"]` is not a thing with an
 * identity, so there is nothing to type, filter or mutate.
 */
export type OpaqueModel = {
    readonly kind: "opaque";
    readonly resource: string;
    readonly queryField: string;
};

export type ResourceModel = CollectionModel | SingularModel | OpaqueModel;

/**
 * Why a `db.json` key produced no schema.
 *
 * Named per cause rather than folded into one "skipped", because "this key has a
 * character GraphQL forbids" and "this key collided with another one" lead
 * somewhere completely different for the person holding the document.
 */
export const SKIP_REASONS = ["unroutable_name", "unnameable", "no_fields"] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

export type SkippedResource = {
    readonly resource: string;
    readonly reason: SkipReason;
};

/**
 * A name this tool had to change, reported so nobody discovers it from a 400.
 *
 * `blog-posts` cannot be a GraphQL field and `posts` colliding with `post` cannot
 * both be `Post`. Both are repaired; neither is repaired quietly.
 */
export type RenamedResource = {
    readonly resource: string;
    readonly published: string;
    readonly reason: "invalid_characters" | "leading_digit" | "collision";
};

export type SchemaModel = {
    readonly resources: readonly ResourceModel[];
    readonly skipped: readonly SkippedResource[];
    readonly renamed: readonly RenamedResource[];
    /** True when nothing at all could be published — an empty schema is not one. */
    readonly isEmpty: boolean;
};

// ─── Serving ────────────────────────────────────────────────────────────────

/** A request as the pure engine sees it: no `Request`, no headers, no host. */
export type GraphqlRequest = {
    readonly query: string;
    readonly variables: Readonly<Record<string, unknown>> | null;
    readonly operationName: string | null;
    /**
     * Whether the transport that carried this request may run a mutation.
     *
     * `GET` may not. The GraphQL-over-HTTP specification makes `GET` the safe,
     * idempotent method, and honouring that is what stops a link — in an email,
     * in a crawler's queue, in a chat client's preview fetcher — from writing to
     * somebody's fixture. It is a property of the *transport*, so it arrives
     * with the request rather than being decided by the engine.
     */
    readonly allowMutation: boolean;
};

export const GRAPHQL_ERRORS = [
    "invalid_json_body",
    "body_not_an_object",
    "missing_query",
    "query_too_long",
    "batching_unsupported",
    "parse_failed",
    "validation_failed",
    "too_deep",
    "too_costly",
    "too_many_root_fields",
    "mutation_over_get",
    "document_full",
    "empty_schema",
] as const;

export type GraphqlError = (typeof GRAPHQL_ERRORS)[number];

/**
 * What the engine decided.
 *
 * `document` being `null` is the signal the repository reads to skip the row
 * lock entirely: a query is answered from a plain read, and only a mutation pays
 * for a transaction. Unlike REST, that cannot be decided from the HTTP method —
 * every GraphQL request is a `POST` — so it is read from the parsed operation.
 * See `planRequest`.
 */
export type GraphqlOutcome = {
    readonly status: number;
    /** Already serialised, so the caller never re-encodes what it just built. */
    readonly body: string;
    /** The document to store, or `null` when nothing changed. */
    readonly document: Readonly<Record<string, unknown>> | null;
    /** Bytes of the document to store. Zero when nothing changed. */
    readonly bytes: number;
    /** The estimated node cost, echoed as a header so a refusal is debuggable. */
    readonly cost: number;
    readonly depth: number;
    /** For the request log. `null` for an anonymous operation. */
    readonly operationName: string | null;
};

// ─── The studio's view of a server ──────────────────────────────────────────

export type GraphqlServerSummary = {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly isPaused: boolean;
    readonly usage: DocumentUsage;
    readonly typeCount: number;
    readonly recordCount: number;
    /** ISO-8601; every one of these crosses a Server Action boundary. */
    readonly createdAt: string;
    readonly updatedAt: string;
};

export type GraphqlServerDetail = GraphqlServerSummary & {
    /** The live document, as canonical text for the editor. */
    readonly document: string;
    /** The derived schema, as plain data for the studio to render. */
    readonly schema: SchemaModel;
    /** The same schema as SDL text, for display and for download. */
    readonly sdl: string;
    /** A runnable query against this document, so a fresh server is not a blank box. */
    readonly starterQuery: string;
};

export type RequestLogRow = {
    readonly id: string;
    readonly operationName: string | null;
    readonly operationType: string;
    readonly status: number;
    readonly durationMs: number;
    readonly cost: number;
    readonly createdAt: string;
};

export type ServerOverview = {
    readonly servers: readonly GraphqlServerSummary[];
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
          readonly server: GraphqlServerSummary;
          /** Shown once, never stored unhashed, never shown again. */
          readonly recoveryKey: string;
      }
    | { readonly ok: false; readonly reason: ActionProblem }
    | DocumentFailure;

export type ImportResult =
    | { readonly ok: true; readonly server: GraphqlServerSummary }
    | { readonly ok: false; readonly reason: ActionProblem };

export type RotateRecoveryResult =
    | { readonly ok: true; readonly recoveryKey: string }
    | { readonly ok: false; readonly reason: ActionProblem };

export type ReplaceDocumentResult =
    | { readonly ok: true; readonly detail: GraphqlServerDetail }
    | { readonly ok: false; readonly reason: ActionProblem }
    | DocumentFailure;
