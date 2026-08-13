import type { JsonValue } from "@/modules/tools/types/json-document";

/**
 * A domain report, narrowed to what JSON can hold.
 *
 * Most adapters here map their result field by field, which is the right thing
 * when the shape is small enough to enumerate — it documents what crosses the
 * boundary and it breaks loudly when the domain type changes underneath. Two of
 * them do not: the Domain Inspector's report is eight nested panels deep, and
 * hand-copying it would be a second copy of the type to keep in step for no
 * benefit a reader could name.
 *
 * So this converts, rather than casts. `undefined` is dropped rather than
 * becoming `null`, because an absent optional field and a field explicitly set
 * to nothing are different claims. A `Date` becomes an ISO string, a `bigint` a
 * decimal one, and anything left that JSON cannot carry — a function, a symbol
 * — is dropped rather than stringified into nonsense.
 *
 * Cycles are not handled and cannot occur: every value that reaches this comes
 * from a domain function returning a plain tree.
 */
export function toJsonValue(value: unknown): JsonValue {
    if (value === null) {
        return null;
    }

    if (typeof value === "string" || typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        // `NaN` and the infinities have no JSON spelling; `JSON.stringify`
        // writes them as `null`, and so does this rather than differing.
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((entry) => toJsonValue(entry));
    }

    if (typeof value === "object") {
        const out: Record<string, JsonValue> = {};

        for (const [key, entry] of Object.entries(value)) {
            if (entry !== undefined && typeof entry !== "function" && typeof entry !== "symbol") {
                out[key] = toJsonValue(entry);
            }
        }

        return out;
    }

    return null;
}
