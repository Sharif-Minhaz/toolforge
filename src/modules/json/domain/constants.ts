import {
    REPAIRABLE_ERROR_CODES,
    type JsonErrorCode,
    type JsonRepairCode,
} from "../../tools/types/json-tree";
import type { JsonFormatOptions, JsonIndent, JsonMode, JsonSpec } from "../types";

/** One indent level per template. Minifying is a mode, not an indent. */
export const INDENT_UNITS: Record<JsonIndent, string> = {
    space2: "  ",
    space3: "   ",
    space4: "    ",
    tab: "\t",
};

export const DEFAULT_JSON_MODE: JsonMode = "beautify";

export const DEFAULT_JSON_INDENT: JsonIndent = "space2";

export const DEFAULT_JSON_SPEC: JsonSpec = "rfc8259";

export const DEFAULT_FORMAT_OPTIONS: JsonFormatOptions = {
    indent: DEFAULT_JSON_INDENT,
    spec: DEFAULT_JSON_SPEC,
    repair: false,
    sortKeys: false,
    escapeUnicode: false,
};

/**
 * Ceiling on one document. Parsing, serialising and measuring all run on the
 * main thread, and a megabyte of JSON already formats in a few milliseconds on
 * a modest phone.
 */
export const MAX_JSON_INPUT_BYTES = 1_048_576;

/**
 * Nesting ceiling. The parser and the serialiser both recurse, so an input like
 * `[[[[…]]]]` would otherwise exhaust the call stack instead of reporting
 * something a person can act on.
 */
export const MAX_JSON_DEPTH = 512;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * How many advisories the report spells out before summarising the rest. A
 * document with a thousand duplicate keys would otherwise render a thousand
 * paragraphs; the count of what was left out is shown rather than dropped.
 */
export const MAX_LISTED_ADVISORIES = 12;

export const JSON_MIME_TYPE = "application/json";

/**
 * Minified on purpose, so the first press of Beautify shows what the tool is
 * for. It carries one of every value kind, a nested object, an array, a number
 * past the safe-integer range, and text outside ASCII.
 */
export const SAMPLE_JSON =
    '{"name":"ToolForge","version":2,"tags":["json","formatter","offline"],' +
    '"limits":{"maxBytes":1048576,"maxDepth":512},"id":9007199254740993,' +
    '"greeting":"héllo 🚀","active":true,"retiredOn":null}';

const REPAIRABLE: ReadonlySet<string> = new Set(REPAIRABLE_ERROR_CODES);

/** Whether turning Repair on would have absorbed this failure. */
export function isRepairable(code: JsonErrorCode): code is JsonRepairCode {
    return REPAIRABLE.has(code);
}
