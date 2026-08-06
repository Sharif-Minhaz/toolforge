/**
 * A budget check for a structured payload whose shape is validated elsewhere.
 *
 * Two schemas in this repository deliberately pass a value through as
 * `z.unknown()` — the mock studio's response body and its canvas graph — because
 * a recursive Zod description of eleven node kinds would be a second, drifting
 * copy of what `validateGraph` already checks. That is the right call about
 * *shape*, and it left *size* unguarded: `serverActions.bodySizeLimit` is 11 MB
 * for the whole app because one tool forwards photographs, so every other action
 * inherits a ceiling eleven times what it needs.
 *
 * Three properties make this the right shape of guard.
 *
 * **It costs the budget, not the payload.** The walk stops the moment the budget
 * is passed, so refusing a hostile payload is bounded work whatever arrived.
 * `JSON.stringify(value).length > limit` is the obvious version and it is the
 * wrong one — it serialises the whole thing first, which is the cost being
 * defended against.
 *
 * **It is iterative.** A ten-thousand-deep array is a real payload somebody can
 * post, and a recursive walk over one is a stack overflow rather than a refusal.
 *
 * **It counts units, not bytes.** UTF-16 code units, the same measure
 * `String.length` and Zod's `.max()` use, plus a fixed charge per value for the
 * punctuation and keys a serialiser would add. That is deliberately an estimate:
 * this decides "is this absurd", and an exact byte count would cost a
 * `TextEncoder` pass over every string to answer a question that does not need
 * one. The charge is what stops a million `null`s from measuring zero.
 */

/**
 * What one value costs before its contents are counted — a comma, a pair of
 * quotes, a colon. Small enough not to distort a real document, large enough
 * that a deeply nested structure of empty containers still has a size.
 */
export const PAYLOAD_UNIT_OVERHEAD = 2;

/**
 * Whether a structured value is past a budget, measured in UTF-16 code units.
 *
 * Returns as soon as the answer is known, so a payload a thousand times the
 * budget costs the same as one just over it.
 */
export function exceedsPayloadBudget(value: unknown, budget: number): boolean {
    if (!Number.isFinite(budget) || budget < 0) {
        return true;
    }

    let total = 0;
    const stack: unknown[] = [value];
    // RSC's wire format can carry a cycle, and a payload nobody validated yet is
    // exactly where one would arrive. Bounded by the walk, which is bounded by
    // the budget.
    const seen = new Set<object>();

    while (stack.length > 0) {
        if (total > budget) {
            return true;
        }

        const current = stack.pop();

        total += PAYLOAD_UNIT_OVERHEAD;

        if (current === null || current === undefined) {
            continue;
        }

        if (typeof current === "string") {
            total += current.length;
            continue;
        }

        if (typeof current === "number" || typeof current === "boolean") {
            // A serialised number is its digits; the fixed charge above covers
            // the short ones and this covers the rest without formatting it.
            total += 8;
            continue;
        }

        if (typeof current !== "object") {
            continue;
        }

        if (seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (Array.isArray(current)) {
            // Charged for its length before a single item is pushed. Walking a
            // half-million-element array to discover it is too big is the exact
            // cost this function exists to avoid — and `length` is free.
            total += current.length * PAYLOAD_UNIT_OVERHEAD;

            if (total > budget) {
                return true;
            }

            for (const item of current) {
                stack.push(item);
            }

            continue;
        }

        // `for…in` with `hasOwn` rather than `Object.entries`, which would
        // allocate a pair for every key of an object that may be refused on its
        // second. The budget is re-checked inside the loop for the same reason.
        for (const key in current) {
            if (!Object.hasOwn(current, key)) {
                continue;
            }

            total += key.length + PAYLOAD_UNIT_OVERHEAD;

            if (total > budget) {
                return true;
            }

            stack.push((current as Record<string, unknown>)[key]);
        }
    }

    return total > budget;
}
