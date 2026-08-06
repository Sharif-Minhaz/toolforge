export const JSON_MODES = ["beautify", "minify", "validate"] as const;

export type JsonMode = (typeof JSON_MODES)[number];

export const JSON_INDENTS = ["space2", "space3", "space4", "tab"] as const;

export type JsonIndent = (typeof JSON_INDENTS)[number];

/**
 * The published grammars a document can be held to. RFC 7159 and ECMA-404 were
 * released as deliberately aligned specifications, so both are listed and both
 * behave identically here — see `spec.ts` for what actually differs.
 */
/**
 * The tree itself, its positions and its failure vocabulary live in
 * `tools/types/json-tree.ts` — shared with the JSON Server Studio, which reads
 * a pasted `db.json` through the same parser. What is left here is this tool's
 * own product: modes, indent presets, the grammars it holds a document to, and
 * the statistics it reports.
 */
export const JSON_SPECS = ["rfc8259", "rfc7159", "rfc4627", "ecma404"] as const;

export type JsonSpec = (typeof JSON_SPECS)[number];

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
