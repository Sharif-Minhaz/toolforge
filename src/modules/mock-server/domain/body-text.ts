import { isJsonType } from "./content-type";
import type { JsonValue } from "../types/graph";

/**
 * The response body as a person types it, on its way to becoming a `ValueExpr`.
 *
 * M1 only: the reader is editing JSON by hand, because the tree editor that
 * replaces this is M2. It stays a thin, honest layer for exactly that reason —
 * whatever it produces is a `{ kind: "static" }` expression, so the tree editor
 * arrives as a second way to build the same value rather than as a rewrite.
 *
 * **The failure is deliberately reasonless.** `JSON.parse` reports
 * `Unexpected token '}' … at position 7` on V8 and `JSON Parse error: …` on
 * JavaScriptCore, so putting the engine's message on the page makes the server
 * render and the hydration pass disagree — the same host-derived trap as
 * `Intl.supportedValuesOf`, arriving from a direction that looks nothing like
 * it. The BSON tool hit this and answered it the same way: a typed reason, and
 * a pointer at the JSON Formatter, which owns a hand-written parser and can name
 * the line.
 */

export type BodyTextResult =
    | { readonly ok: true; readonly value: JsonValue }
    | { readonly ok: false; readonly reason: "invalid_json" };

export function parseBodyText(text: string, contentType: string): BodyTextResult {
    if (!isJsonType(contentType)) {
        // Under any non-JSON type the text is the body, verbatim. Parsing it
        // would be inventing a structure the author did not ask for.
        return { ok: true, value: text };
    }

    const trimmed = text.trim();

    if (trimmed === "") {
        return { ok: true, value: null };
    }

    try {
        return { ok: true, value: JSON.parse(trimmed) as JsonValue };
    } catch {
        return { ok: false, reason: "invalid_json" };
    }
}

/**
 * The inverse, for filling the editor from a stored value.
 *
 * Indented, because the reader is about to edit it. A body that arrives as one
 * long line is a body nobody can change without reformatting it first.
 */
export function formatBodyText(value: JsonValue, contentType: string): string {
    if (!isJsonType(contentType)) {
        return typeof value === "string" ? value : JSON.stringify(value ?? null, null, 4);
    }

    return JSON.stringify(value ?? null, null, 4);
}
