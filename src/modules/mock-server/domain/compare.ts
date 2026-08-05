import type { JsonValue } from "../types/graph";

/**
 * Comparing two values the reader picked from dropdowns.
 *
 * The brief's example is `IF Request.email Equals admin@test.com` — so one side
 * usually comes out of a request as a **string**, and the other is typed into a
 * box as a **string**, while a JSON body can perfectly well hold the number 42
 * where the form holds `"42"`. Deciding what those mean is the whole job here,
 * and the answer has to be written down rather than discovered.
 *
 * **Loose on the two texts a request can only ever carry as text.** `"42"`
 * equals `42` because a path parameter is always a string, and refusing that
 * would make `/users/:id` unusable in a condition. `"true"` equals `true` for
 * exactly the same reason, and that one had to be corrected: this file used to
 * argue that a body holding the string `"true"` is a different fact from one
 * holding the boolean, which is true and was the wrong rule to draw from it.
 *
 * A query string has no booleans in it. `?is_stock=true` arrives as the four
 * characters `true`, and the operand box beside it coerces a typed `true` to the
 * boolean — because a *response body* is JSON, where the two differ. So the two
 * halves of the same condition disagreed by construction, `is_stock equals true`
 * could never match, and nothing in the UI could express what the reader wanted:
 * there was no way to type a string `"true"` either. A rule that cannot be
 * satisfied from either side is not strictness, it is a dead control.
 *
 * What that gives up is telling a body's `"true"` from its `true`. That is a
 * real distinction and a far rarer one than comparing a query parameter to a
 * boolean, which is most of what conditions are for.
 */

export const COMPARE_OPS = [
    "equals",
    "notEquals",
    "contains",
    "notContains",
    "startsWith",
    "endsWith",
    "greaterThan",
    "lessThan",
    "exists",
    "notExists",
    "isEmpty",
    "matches",
] as const;

export type CompareOp = (typeof COMPARE_OPS)[number];

export function isCompareOp(value: string): value is CompareOp {
    return (COMPARE_OPS as readonly string[]).includes(value);
}

/** The numeric reading of a value, or null when there is not one. */
function asNumber(value: JsonValue): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

/**
 * The boolean reading of a value, or null when there is not one.
 *
 * Only the literal words. `"1"` and `1` are deliberately *not* booleans here —
 * that is JavaScript's mistake, and it would make `1 equals true` quietly hold
 * for a count of one.
 */
function asBoolean(value: JsonValue): boolean | null {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const text = value.trim().toLowerCase();

        return text === "true" ? true : text === "false" ? false : null;
    }

    return null;
}

function asText(value: JsonValue): string {
    if (value === null) {
        return "";
    }

    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Present at all — `null` and the empty string are both absences here. */
function exists(value: JsonValue): boolean {
    return value !== null && value !== "";
}

function looseEquals(left: JsonValue, right: JsonValue): boolean {
    if (left === right) {
        return true;
    }

    // Both numeric: compare as numbers, so `"42"` matches `42`.
    const leftNumber = asNumber(left);
    const rightNumber = asNumber(right);

    if (leftNumber !== null && rightNumber !== null) {
        return leftNumber === rightNumber;
    }

    // Both boolean-ish: compare as booleans, so `?flag=true` matches `true`.
    // Checked after numbers so nothing here can see `"1"` — `asBoolean` reads
    // only the literal words, and the number branch has already claimed digits.
    const leftBoolean = asBoolean(left);
    const rightBoolean = asBoolean(right);

    if (leftBoolean !== null && rightBoolean !== null) {
        return leftBoolean === rightBoolean;
    }

    // Structural values compare by their JSON, which is the only equality that
    // means anything for an object the reader picked out of a body.
    if (typeof left === "object" && typeof right === "object" && left !== null && right !== null) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    return false;
}

/**
 * A regular expression from a string somebody typed.
 *
 * Compiled fresh each time and never cached, and **never with the `g` flag** —
 * a `RegExp` with `lastIndex` is mutable state, and a cached one shared between
 * requests would give a different answer on every other call. The same rule the
 * fingerprint table in the Domain Inspector follows.
 *
 * An invalid pattern is `false`, not a thrown error: the reader is typing it
 * live and half a pattern is not a reason to 500 somebody's mock.
 */
function matches(value: JsonValue, pattern: JsonValue): boolean {
    try {
        return new RegExp(asText(pattern), "u").test(asText(value));
    } catch {
        try {
            // Without the `u` flag, for a pattern that is valid in the older
            // grammar — `\d{2,}` with an unescaped brace, say.
            return new RegExp(asText(pattern)).test(asText(value));
        } catch {
            return false;
        }
    }
}

export function compareValues(left: JsonValue, op: CompareOp, right: JsonValue): boolean {
    switch (op) {
        case "equals":
            return looseEquals(left, right);
        case "notEquals":
            return !looseEquals(left, right);
        case "contains":
            return Array.isArray(left)
                ? left.some((item) => looseEquals(item, right))
                : asText(left).includes(asText(right));
        case "notContains":
            return !(Array.isArray(left)
                ? left.some((item) => looseEquals(item, right))
                : asText(left).includes(asText(right)));
        case "startsWith":
            return asText(left).startsWith(asText(right));
        case "endsWith":
            return asText(left).endsWith(asText(right));
        case "greaterThan": {
            const a = asNumber(left);
            const b = asNumber(right);

            // Non-numeric operands fall back to lexicographic order, which is
            // what makes `greaterThan` usable on a date string.
            return a !== null && b !== null ? a > b : asText(left) > asText(right);
        }
        case "lessThan": {
            const a = asNumber(left);
            const b = asNumber(right);

            return a !== null && b !== null ? a < b : asText(left) < asText(right);
        }
        case "exists":
            return exists(left);
        case "notExists":
            return !exists(left);
        case "isEmpty":
            return (
                left === null ||
                left === "" ||
                (Array.isArray(left) && left.length === 0) ||
                (typeof left === "object" && Object.keys(left).length === 0)
            );
        default:
            return matches(left, right);
    }
}

/**
 * Picks a branch by weight.
 *
 * The brief's example is 80% success and 20% failure. Weights are relative
 * rather than percentages, so a reader can write 3 and 1 without doing
 * arithmetic, and a set that does not add to 100 still behaves sensibly.
 *
 * Negative and non-finite weights are treated as zero. A set that is entirely
 * zero falls back to the first branch rather than to nothing, because a graph
 * that stops mid-flight is a 500 and an arbitrary-but-valid branch is a
 * response.
 */
export function pickWeighted<T extends { readonly weight: number }>(
    branches: readonly T[],
    draw: number,
): T | undefined {
    if (branches.length === 0) {
        return undefined;
    }

    const safe = branches.map((branch) =>
        Number.isFinite(branch.weight) && branch.weight > 0 ? branch.weight : 0,
    );
    const total = safe.reduce((sum, weight) => sum + weight, 0);

    if (total <= 0) {
        return branches[0];
    }

    let cursor = Math.min(Math.max(draw, 0), 0.999_999_999) * total;

    for (const [index, weight] of safe.entries()) {
        cursor -= weight;

        if (cursor < 0) {
            return branches[index];
        }
    }

    return branches.at(-1);
}
