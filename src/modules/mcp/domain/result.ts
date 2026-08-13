import type { JsonValue } from "@/modules/tools/types/json-document";

import type { McpToolOutcome } from "../types";

/**
 * How an outcome is phrased.
 *
 * These strings are protocol payload, not interface copy, and they are the one
 * place on this site that is deliberately English-only. A tool result is read
 * by a model, which is then asked to answer the person in whatever language the
 * conversation is in — translating on the way out and back would put two
 * lossy hops where there is currently none, and would make `reason` codes
 * ambiguous across catalogues. What a reader sees is still localised, because
 * what a reader sees is the assistant's reply, not this.
 *
 * Two rules hold throughout. A summary states the outcome rather than narrating
 * it — "16-character password, 96 bits of entropy", never "generation
 * successful". And a refusal keeps the domain layer's own name for it, so the
 * same input refused twice reports the same word twice.
 */

export function succeed(summary: string, data: JsonValue): McpToolOutcome {
    return { ok: true, summary, data };
}

export function refuse(reason: string, summary: string, data?: JsonValue): McpToolOutcome {
    return data === undefined
        ? { ok: false, reason, summary }
        : { ok: false, reason, summary, data };
}

/**
 * A refusal built from a domain failure whose reason speaks for itself.
 *
 * `too_long`, `invalid_quantity`, `unsupported_algorithm` — these were named to
 * be read, and turning `snake_case` into words is the whole translation needed.
 * Where a reason genuinely needs a sentence to be actionable, the adapter
 * writes one instead of calling this.
 */
export function refuseWithReason(
    tool: string,
    reason: string,
    extra?: Readonly<Record<string, JsonValue>>,
): McpToolOutcome {
    return {
        ok: false,
        reason,
        summary: `${tool} refused the request: ${reason.replaceAll("_", " ")}.`,
        data: { reason, ...extra },
    };
}
