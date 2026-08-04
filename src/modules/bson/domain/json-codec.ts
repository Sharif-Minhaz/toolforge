import { JSON_INDENT_WIDTHS } from "./constants";
import type { ConversionFailure, JsonIndent, JsonValue } from "../types";

export type ReadJsonResult = { readonly ok: true; readonly value: JsonValue } | ConversionFailure;

/**
 * No position on the failure, deliberately.
 *
 * `JSON.parse`'s message is the host's, not ours: V8 says
 * `Unexpected token '}' ... at position 7`, JavaScriptCore says
 * `JSON Parse error: Unexpected token '}'`, and neither promises to keep
 * saying it. This value is derived during render, so a message read off the
 * engine would differ between the server pass and the browser's and hydration
 * would mismatch — the same trap as building an option list from
 * `Intl.supportedValuesOf`.
 *
 * The tool answers instead by pointing at the JSON Formatter, which owns a
 * hand-written parser and can name the line, the column and the character.
 */
export function readJson(text: string): ReadJsonResult {
    try {
        return { ok: true, value: JSON.parse(text) as JsonValue };
    } catch {
        return { ok: false, reason: "invalid_json" };
    }
}

export function writeJson(value: JsonValue, indent: JsonIndent): string {
    const width = JSON_INDENT_WIDTHS[indent];

    return width === null ? JSON.stringify(value) : JSON.stringify(value, null, width);
}
