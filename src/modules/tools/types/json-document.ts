/**
 * The data model both hosted-fixture studios run on.
 *
 * A `db.json` is the same document whether it is served as REST by the JSON
 * Server Studio or as a schema by the GraphQL Server Studio, so the reader, the
 * ids, the resource kinds and the size accounting are shared and only the
 * *serving* differs. This file is the vocabulary that seam is written in; it
 * moved out of `json-server/types` the moment a second studio needed it, on the
 * same rule the image tools' codec layer followed.
 *
 * The model is deliberately `JsonValue` — a plain JavaScript value — and not the
 * positioned tree `tools/types/json-tree.ts` describes. That tree exists so a
 * *human* pasting a document can be told which line is wrong; once the document
 * is stored, what an engine manipulates is data, and carrying source positions
 * through every sort, filter and merge would be carrying a fact about a text
 * nobody has any more.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** The whole `db.json`: top-level keys mapping to collections or single objects. */
export type JsonDocument = JsonObject;

/**
 * What a top-level key turned out to be.
 *
 * `collection` is an array of objects. In REST it gets the six CRUD routes; in
 * GraphQL it gets a type, a list field, a by-id field and four mutations.
 * `singular` is a lone object — there is nothing to create a second of and no id
 * to delete by, so both studios expose it read-and-replace only.
 * `opaque` is anything else: a top-level string, number, or an array of scalars.
 * It is stored and readable and nothing more, because "record 3 of `[1,2,3]`" is
 * not a thing with an identity.
 */
export const RESOURCE_KINDS = ["collection", "singular", "opaque"] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type ResourceSummary = {
    readonly name: string;
    readonly kind: ResourceKind;
    /** Records, for a collection. Zero for anything else. */
    readonly count: number;
    /**
     * False when the key cannot be published as written — see
     * `RESOURCE_NAME_PATTERN`. Such a key is kept in the document and served
     * inside its parent, but publishes no route and no GraphQL field of its own,
     * and each studio says which ones those are rather than leaving a resource
     * that silently disappears.
     */
    readonly routable: boolean;
    /** Keys seen across the collection's records, for route hints and type inference. */
    readonly fields: readonly string[];
};

/**
 * How reading a document somebody supplied can fail.
 *
 * Every member is a message key in both catalogues, in both studios. `position`
 * is set only for failures the parser could pinpoint, which is why it is
 * optional rather than a zero — a zero would render as "line 0".
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

/**
 * How full a stored document is, as a studio reports it.
 *
 * Named for the document rather than for the server because that is what it
 * measures — the same bytes mean the same thing behind a REST endpoint and
 * behind a GraphQL one.
 */
export type DocumentUsage = {
    readonly bytes: number;
    readonly limit: number;
    /** 0–100, rounded, so the bar and the label cannot disagree. */
    readonly percent: number;
    /** True past `DOCUMENT_WARN_RATIO`; the bar changes tone and the copy warns. */
    readonly nearLimit: boolean;
    /** True at the ceiling. Writes are refused until something is deleted. */
    readonly full: boolean;
};
