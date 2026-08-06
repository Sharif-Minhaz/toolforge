import { SERVER_NAME_LENGTH } from "./constants";

/**
 * What a JSON server may be called.
 *
 * The name is displayed back to the visitor who typed it and to nobody else, so
 * the rules are about legibility rather than safety — React escapes it on the
 * way out, and no query interpolates it. The *key* is the part that has to be
 * safe, and that lives in `tools/domain/server-key.ts`. What is enforced here is
 * that a name has something in it, fits the list, and does not smuggle a line
 * break into a single-line control.
 */

export type ServerNameResult =
    | { readonly ok: true; readonly name: string }
    | { readonly ok: false; readonly reason: "invalid_name" };

/**
 * Collapses every run of whitespace — including the tabs and newlines a paste
 * brings with it — to one space, then trims. A name is one line by definition,
 * and normalising here means the rest of the app never has to wonder.
 */
function normalizeServerName(input: string): string {
    return input.replace(/\s+/gu, " ").trim();
}

export function checkServerName(input: string): ServerNameResult {
    const name = normalizeServerName(input);

    // Counted in code points, not UTF-16 units: a name of emoji or of Bengali
    // conjuncts would otherwise hit the ceiling at half the visible length.
    const length = [...name].length;

    if (length < SERVER_NAME_LENGTH.min || length > SERVER_NAME_LENGTH.max) {
        return { ok: false, reason: "invalid_name" };
    }

    return { ok: true, name };
}
