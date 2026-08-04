import { decode, encode, ToonDecodeError } from "@toon-format/toon";

import { TOON_DELIMITER_CHARACTERS, TOON_INDENT_WIDTHS } from "./constants";
import type { ConversionFailure, ConversionOptions, JsonValue } from "../types";

export type ReadToonResult = { readonly ok: true; readonly value: JsonValue } | ConversionFailure;

/**
 * Unlike `JSON.parse`, this decoder is ours by way of the format's own
 * reference implementation, so its errors are the same on every host and the
 * line number it carries is safe to render. `ToonDecodeError` extends
 * `SyntaxError`, so the `instanceof` check is what separates "the document was
 * wrong" from a bug in this module.
 */
export function readToon(text: string, options: ConversionOptions): ReadToonResult {
    try {
        return {
            ok: true,
            value: decode(text, {
                indentSize: TOON_INDENT_WIDTHS[options.toonIndent],
                strict: options.toonStrict,
            }) as JsonValue,
        };
    } catch (caught) {
        if (caught instanceof ToonDecodeError) {
            return { ok: false, reason: "invalid_toon", line: caught.line };
        }

        throw caught;
    }
}

export function writeToon(value: JsonValue, options: ConversionOptions): string {
    return encode(value, {
        indentSize: TOON_INDENT_WIDTHS[options.toonIndent],
        delimiter: TOON_DELIMITER_CHARACTERS[options.toonDelimiter],
    });
}

/**
 * Whether any string in the document contains the delimiter that is about to
 * separate the columns.
 *
 * The encoder handles it correctly — it quotes the value — but quoting is what
 * the delimiter choice was meant to avoid, so a tab or a pipe picked to save
 * characters can silently cost more than the comma it replaced. Worth one
 * sentence under the output rather than leaving the reader to compare lengths.
 */
export function containsDelimiter(value: JsonValue, delimiter: string): boolean {
    if (typeof value === "string") {
        return value.includes(delimiter);
    }

    if (Array.isArray(value)) {
        return value.some((item) => containsDelimiter(item, delimiter));
    }

    if (typeof value === "object" && value !== null) {
        return Object.values(value).some((item) => containsDelimiter(item, delimiter));
    }

    return false;
}
