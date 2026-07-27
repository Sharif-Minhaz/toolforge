import type { JwtClaims } from "../types";

export type JsonObjectResult =
    | { readonly ok: true; readonly value: JwtClaims }
    | { readonly ok: false; readonly reason: "invalid_json" | "not_an_object" };

/** RFC 7519 §7.2: both halves of a JWT must be a JSON object, not an array. */
export function isJsonObject(value: unknown): value is JwtClaims {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(text: string): JsonObjectResult {
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, reason: "invalid_json" };
    }

    return isJsonObject(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, reason: "not_an_object" };
}
