export const JSON_MODES = ["beautify", "minify", "validate"] as const;

export type JsonMode = (typeof JSON_MODES)[number];

export const JSON_INDENTS = ["space2", "space3", "space4", "tab"] as const;

export type JsonIndent = (typeof JSON_INDENTS)[number];

/**
 * The published grammars a document can be held to. RFC 7159 and ECMA-404 were
 * released as deliberately aligned specifications, so both are listed and both
 * behave identically here — see `spec.ts` for what actually differs.
 */
export const JSON_SPECS = ["rfc8259", "rfc7159", "rfc4627", "ecma404"] as const;

export type JsonSpec = (typeof JSON_SPECS)[number];

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

/** Human coordinates: lines and columns count from 1, in characters. */
export type JsonPosition = {
    readonly line: number;
    readonly column: number;
    /** 0-based character index, for callers that want to slice the input. */
    readonly offset: number;
};

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

export type JsonFormatOptions = {
    readonly indent: JsonIndent;
    readonly spec: JsonSpec;
    /** Accepts and corrects the usual non-standard extras instead of failing. */
    readonly repair: boolean;
    readonly sortKeys: boolean;
    /** Rewrites every non-ASCII character as `\uXXXX`. */
    readonly escapeUnicode: boolean;
};

export type JsonSerializeOptions = {
    /** One indent level, or the empty string to minify. */
    readonly indent: string;
    readonly sortKeys: boolean;
    readonly escapeUnicode: boolean;
};

export type JsonStats = {
    readonly objects: number;
    readonly arrays: number;
    readonly keys: number;
    readonly strings: number;
    readonly numbers: number;
    readonly booleans: number;
    readonly nulls: number;
    /** Deepest container nesting; a scalar document is 0. */
    readonly depth: number;
};

export type JsonExportRequest = {
    readonly mode: JsonMode;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
