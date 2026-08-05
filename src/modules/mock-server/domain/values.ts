import { MAX_ARRAY_ITEMS, MAX_VALUE_DEPTH } from "./constants";
import type { CountExpr, ExecutionContext, JsonValue, ValueExpr } from "../types/graph";

/**
 * Turning a `ValueExpr` into the JSON that goes in a response.
 *
 * Pure apart from what the context injects, which is the whole point: `clock`
 * and `random` are parameters, so the reproducibility invariant in
 * `docs/mock-server-studio.md` §6.2 — same graph, same request, same seed,
 * identical bytes — is a thing a test can assert rather than a thing hoped for.
 *
 * M1 resolves `static`, `object` and `array`; the rest of the union is what M2's
 * value picker produces, and until then they are a typed refusal rather than a
 * silent `null`. A mock that quietly returns null where a name was asked for is
 * worse than one that says it cannot do that yet.
 */

export type ResolveResult =
    | { readonly ok: true; readonly value: JsonValue }
    | { readonly ok: false; readonly reason: "unsupported_value" | "value_depth_exceeded" };

/**
 * Clamped, and clamped here rather than at the caller: an array count is the
 * one place a single number turns into unbounded work, so the ceiling lives
 * next to the arithmetic that uses it.
 */
function clampCount(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(Math.max(Math.floor(value), 0), MAX_ARRAY_ITEMS);
}

function resolveCount(count: CountExpr, context: ExecutionContext): number {
    if (count.kind === "fixed") {
        return clampCount(count.n);
    }

    const min = clampCount(count.min);
    const max = clampCount(count.max);

    if (max <= min) {
        return min;
    }

    // Inclusive of both ends, and drawn from the injected source so the same
    // seed produces the same length.
    return min + Math.floor(context.random() * (max - min + 1));
}

export function resolveValue(expr: ValueExpr, context: ExecutionContext, depth = 0): ResolveResult {
    if (depth > MAX_VALUE_DEPTH) {
        return { ok: false, reason: "value_depth_exceeded" };
    }

    switch (expr.kind) {
        case "static":
            return { ok: true, value: expr.value };

        case "object": {
            const value: Record<string, JsonValue> = {};

            for (const field of expr.fields) {
                const resolved = resolveValue(field.value, context, depth + 1);

                if (!resolved.ok) {
                    return resolved;
                }

                value[field.key] = resolved.value;
            }

            return { ok: true, value };
        }

        case "array": {
            const count = resolveCount(expr.count, context);
            const items: JsonValue[] = [];

            for (let index = 0; index < count; index += 1) {
                const resolved = resolveValue(expr.of, context, depth + 1);

                if (!resolved.ok) {
                    return resolved;
                }

                items.push(resolved.value);
            }

            return { ok: true, value: items };
        }

        default:
            return { ok: false, reason: "unsupported_value" };
    }
}
