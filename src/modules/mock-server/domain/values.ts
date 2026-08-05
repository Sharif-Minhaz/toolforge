import { MAX_ARRAY_ITEMS, MAX_TEMPLATE_LENGTH, MAX_VALUE_DEPTH } from "./constants";
import { isFakerFnId } from "./faker-registry";
import { readJsonPath, readStringMap } from "./json-path";
import { randomInt, randomPick, seededUuid } from "./seeded-random";
import type {
    CountExpr,
    ExecutionContext,
    JsonValue,
    RequestSource,
    ValueExpr,
} from "../types/graph";

/**
 * Turning a `ValueExpr` into the JSON that goes in a response.
 *
 * This is the half of the studio the brief cared about most — *"the user selects
 * providers through dropdowns, never types template syntax"* — so every kind
 * here exists to replace something a person would otherwise have written by
 * hand. `template` replaces string interpolation, `request` replaces
 * `{{body.email}}`, `oneOf` replaces a ternary.
 *
 * Pure apart from what the context injects. `clock`, `now`, `random` and
 * `faker` are all parameters, which is what makes the reproducibility invariant
 * — same graph, same request, same seed, identical bytes — something a test
 * asserts rather than something hoped for.
 */

export type ResolveFailureReason = "unsupported_value" | "value_depth_exceeded";

export type ResolveResult =
    | { readonly ok: true; readonly value: JsonValue }
    | { readonly ok: false; readonly reason: ResolveFailureReason };

const MISS: ResolveResult = { ok: true, value: null };

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

    return max <= min ? min : randomInt(context.random, min, max);
}

/** Which part of the request a `request` value reads, and how it is keyed. */
function readRequest(source: RequestSource, path: string, context: ExecutionContext): JsonValue {
    const { request } = context;

    switch (source) {
        case "body":
            return readJsonPath(request.body, path);
        // HTTP defines header names as case-insensitive, so a reader who typed
        // `Authorization` must not silently get nothing because the runtime
        // lower-cased it on the way in. Cookies, query and path parameters are
        // all case-*sensitive*, and pretending otherwise would invent matches.
        case "header":
            return readStringMap(request.headers, path, true);
        case "cookie":
            return readStringMap(request.cookies, path, false);
        case "query":
            return readStringMap(request.query, path, false);
        default:
            return readStringMap(request.params, path, false);
    }
}

/**
 * What a value looks like inside a template.
 *
 * `null` and `undefined` become the empty string rather than the words "null"
 * and "undefined", because a template is prose — "Hello null" is never what
 * somebody building `Hello {name}` meant. Objects and arrays are stringified,
 * which is the only sensible thing left and is rare enough not to warrant a
 * refusal.
 */
function templatePart(value: JsonValue): string {
    if (value === null) {
        return "";
    }

    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function resolveValue(expr: ValueExpr, context: ExecutionContext, depth = 0): ResolveResult {
    if (depth > MAX_VALUE_DEPTH) {
        return { ok: false, reason: "value_depth_exceeded" };
    }

    switch (expr.kind) {
        case "static":
            return { ok: true, value: expr.value };

        case "request":
            return { ok: true, value: readRequest(expr.source, expr.path, context) };

        case "env":
            return { ok: true, value: readStringMap(context.env, expr.key, false) };

        case "var":
            // A variable read before anything set it is a miss, not a failure:
            // `validateGraph` is what catches an unreachable write, and doing it
            // again here would turn a save-time problem into a 500.
            return { ok: true, value: context.vars[expr.name] ?? null };

        case "uuid":
            return { ok: true, value: seededUuid(context.random) };

        case "now": {
            const epochMs = context.now();

            switch (expr.format) {
                case "epochMs":
                    return { ok: true, value: epochMs };
                case "epochSeconds":
                    return { ok: true, value: Math.floor(epochMs / 1_000) };
                default:
                    return { ok: true, value: new Date(epochMs).toISOString() };
            }
        }

        case "faker": {
            // Absent provider or unknown id both refuse rather than returning
            // null. A response that quietly says `null` where a name was asked
            // for is harder to diagnose than one that says it could not.
            if (context.faker === undefined || !isFakerFnId(expr.fn)) {
                return { ok: false, reason: "unsupported_value" };
            }

            return { ok: true, value: context.faker(expr.fn, context.random) };
        }

        case "template": {
            let out = "";

            for (const part of expr.parts) {
                if (typeof part === "string") {
                    out += part;
                    continue;
                }

                const resolved = resolveValue(part, context, depth + 1);

                if (!resolved.ok) {
                    return resolved;
                }

                out += templatePart(resolved.value);

                if (out.length > MAX_TEMPLATE_LENGTH) {
                    // A template over an array expression is the one shape here
                    // that can grow without an item ceiling catching it.
                    return { ok: true, value: out.slice(0, MAX_TEMPLATE_LENGTH) };
                }
            }

            return { ok: true, value: out };
        }

        case "oneOf": {
            const chosen = randomPick(context.random, expr.options);

            return chosen === undefined ? MISS : resolveValue(chosen, context, depth + 1);
        }

        case "object": {
            const value: Record<string, JsonValue> = {};

            for (const field of expr.fields) {
                // A field with no key would serialise as `""`, which is legal
                // JSON and never what anybody meant, so it is skipped — the tree
                // editor always has one blank row waiting to be filled.
                if (field.key === "") {
                    continue;
                }

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
                // Resolved per item rather than once and copied, so an array of
                // `faker` values is a list of different people rather than the
                // same person a hundred times.
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
