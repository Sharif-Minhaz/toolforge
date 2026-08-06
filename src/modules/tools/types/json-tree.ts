/**
 * The shape a JSON document takes between being read and being written.
 *
 * Lifted out of the JSON Formatter when the JSON Server Studio needed to read a
 * `db.json` somebody pasted and tell them *where* it went wrong. What moved is
 * the tree, the positions and the failure vocabulary — everything a reader and a
 * writer both have to agree on. What stayed in the formatter is its own product:
 * modes, indent presets, the published grammars it can hold a document to, and
 * the statistics it reports.
 *
 * The reason a hand-written reader exists at all — rather than `JSON.parse` —
 * is in `tools/domain/json-parser.ts`, and it is the same reason CLAUDE.md gives
 * for the BSON module refusing to render an engine's `SyntaxError`: those
 * messages are host-derived, so a page that printed one would disagree between
 * the server pass and the hydration pass.
 */

/** Human coordinates: lines and columns count from 1, in characters. */
export type JsonPosition = {
    readonly line: number;
    readonly column: number;
    /** 0-based character index, for callers that want to slice the input. */
    readonly offset: number;
};

export const JSON_ERROR_CODES = [
    "empty",
    "too_large",
    "too_deep",
    "unexpected_token",
    "unexpected_end",
    "unterminated_string",
    "invalid_escape",
    "invalid_number",
    "invalid_literal",
    "control_character",
    "trailing_content",
    "trailing_comma",
    "missing_comma",
    "comment",
    "non_standard_quote",
    "unquoted_key",
    "non_standard_literal",
    "root_not_container",
    "unpaired_surrogate",
] as const;

export type JsonErrorCode = (typeof JSON_ERROR_CODES)[number];

/**
 * The subset of failures the repair pass knows how to absorb. One list drives
 * both the parser's lenient branches and the "turn on Repair" hint, so the
 * offer can never disagree with what repair actually does.
 */
export const REPAIRABLE_ERROR_CODES = [
    "invalid_escape",
    "invalid_number",
    "control_character",
    "trailing_comma",
    "missing_comma",
    "comment",
    "non_standard_quote",
    "unquoted_key",
    "non_standard_literal",
] as const;

export type JsonRepairCode = (typeof REPAIRABLE_ERROR_CODES)[number];

export const JSON_ADVISORY_CODES = [
    "duplicate_key",
    "unpaired_surrogate",
    "precision_loss",
] as const;

export type JsonAdvisoryCode = (typeof JSON_ADVISORY_CODES)[number];

export type JsonError = JsonPosition & {
    readonly code: JsonErrorCode;
    /** The offending character or word, when one can be pinpointed. */
    readonly found?: string;
    /** What the grammar wanted instead — punctuation, so it stays untranslated. */
    readonly expected?: string;
};

/** Something the repair pass silently corrected on the way through. */
export type JsonRepair = JsonPosition & {
    readonly code: JsonRepairCode;
};

/** Valid JSON that is still worth a word of warning. */
export type JsonAdvisory = JsonPosition & {
    readonly code: JsonAdvisoryCode;
    /** The repeated member name, for `duplicate_key`. */
    readonly key?: string;
    /** The literal as written, for `precision_loss`. */
    readonly literal?: string;
};

export type JsonNode =
    | {
          readonly kind: "object";
          readonly at: JsonPosition;
          readonly members: readonly JsonMember[];
      }
    | { readonly kind: "array"; readonly at: JsonPosition; readonly items: readonly JsonNode[] }
    | { readonly kind: "string"; readonly at: JsonPosition; readonly value: string }
    // Numbers keep the literal exactly as written. Routing them through a
    // double would quietly round a 19-digit id on the way to the output.
    | { readonly kind: "number"; readonly at: JsonPosition; readonly raw: string }
    | { readonly kind: "boolean"; readonly at: JsonPosition; readonly value: boolean }
    | { readonly kind: "null"; readonly at: JsonPosition };

export type JsonMember = {
    readonly key: string;
    /** Position of the key, so a duplicate can be pointed at precisely. */
    readonly at: JsonPosition;
    readonly value: JsonNode;
};

export type JsonSerializeOptions = {
    /** One indent level, or the empty string to minify. */
    readonly indent: string;
    readonly sortKeys: boolean;
    readonly escapeUnicode: boolean;
};

/**
 * Nesting ceiling. The parser and the serialiser both recurse, so an input like
 * `[[[[…]]]]` would otherwise exhaust the call stack instead of reporting
 * something a person can act on.
 */
export const MAX_JSON_DEPTH = 512;
