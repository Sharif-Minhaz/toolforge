/**
 * The three notations this tool reads and writes. Every conversion is a parse
 * into one shared value and a write back out of it — never a rewrite of one
 * syntax into another — so a new format costs one reader and one writer and
 * touches nothing the others own.
 */
export const DATA_FORMATS = ["bson", "json", "toon"] as const;

export type DataFormat = (typeof DATA_FORMATS)[number];

/**
 * BSON is bytes and this is a text box, so it needs a notation. Hex is what
 * `bsondump` and the MongoDB documentation print; base64 is what drivers and
 * logs carry.
 */
export const BSON_ENCODINGS = ["hex", "base64"] as const;

export type BsonEncoding = (typeof BSON_ENCODINGS)[number];

/**
 * How BSON's type system is written down in a notation that has no room for it.
 *
 * Canonical keeps every type in a `$`-prefixed wrapper and round-trips a
 * document back to identical bytes. Relaxed writes what plain JSON can say and
 * loses the distinctions plain JSON cannot — which the tool proves per document
 * rather than asserting.
 */
export const EJSON_MODES = ["canonical", "relaxed"] as const;

export type EjsonMode = (typeof EJSON_MODES)[number];

export const JSON_INDENTS = ["minified", "two", "four", "tab"] as const;

export type JsonIndent = (typeof JSON_INDENTS)[number];

/** Tabs and pipes buy a few more tokens back when no value contains one. */
export const TOON_DELIMITERS = ["comma", "tab", "pipe"] as const;

export type ToonDelimiter = (typeof TOON_DELIMITERS)[number];

export const TOON_INDENTS = ["two", "four"] as const;

export type ToonIndent = (typeof TOON_INDENTS)[number];

export type ConversionOptions = {
    readonly bsonEncoding: BsonEncoding;
    readonly ejsonMode: EjsonMode;
    readonly jsonIndent: JsonIndent;
    readonly toonDelimiter: ToonDelimiter;
    readonly toonIndent: ToonIndent;
    /** Off lets a hand-edited `[N]` header disagree with the rows under it. */
    readonly toonStrict: boolean;
};

/**
 * The value every reader produces and every writer consumes: the JSON data
 * model, nothing wider. BSON's own types survive a trip through it as Extended
 * JSON wrappers rather than as anything this union has to know about.
 */
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject;

export type JsonArray = readonly JsonValue[];

export type JsonObject = { readonly [key: string]: JsonValue };

export type ConversionFailureReason =
    | "empty"
    | "too_large"
    | "invalid_hex"
    | "invalid_base64"
    | "invalid_bson"
    | "invalid_json"
    | "invalid_toon"
    | "root_not_object";

export type ConversionFailure = {
    readonly ok: false;
    readonly reason: ConversionFailureReason;
    /** 1-based, set only by readers that can point at one — TOON's decoder. */
    readonly line?: number;
    /** Bytes the BSON header claims, against the count that actually arrived. */
    readonly declaredBytes?: number;
    readonly actualBytes?: number;
};

/**
 * What the conversion changed or could not carry. Each id is a member of this
 * union so its message key is checked at compile time.
 */
export type ConversionNoteId =
    "extendedJson" | "relaxedLossy" | "canonicalVerbose" | "numbersRetyped" | "delimiterInValues";

/**
 * `lossy` is the only one that costs the reader something; the other two say
 * what happened so a correct-looking result is not mistaken for a free one.
 */
export type ConversionNoteKind = "lossy" | "adapted" | "info";

export type ConversionNote = {
    readonly id: ConversionNoteId;
    readonly kind: ConversionNoteKind;
};

export type ConversionRequest = {
    readonly source: DataFormat;
    readonly target: DataFormat;
    readonly input: string;
    readonly options: ConversionOptions;
};

export type ConversionSuccess = {
    readonly ok: true;
    readonly output: string;
    readonly notes: readonly ConversionNote[];
    /**
     * Character counts, not tokens. A tokenizer is a megabyte of vocabulary and
     * a different answer per model, so the tool measures the thing it can
     * measure exactly and says which one that is.
     */
    readonly inputLength: number;
    readonly outputLength: number;
    /** Present only when the target is BSON, for the `.bson` download. */
    readonly bytes: Uint8Array | null;
};

export type ConversionResult = ConversionSuccess | ConversionFailure;
