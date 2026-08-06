import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { MAX_OPENAPI_DOCUMENT_BYTES } from "../domain/constants";

/**
 * Getting an OpenAPI document into a plain value.
 *
 * Two jobs, both server-only: parse whatever notation arrived, and resolve the
 * `$ref` pointers so `domain/openapi.ts` never has to know they existed.
 *
 * **The resolver is written here rather than taken from a package.** The
 * repository's rule is to depend on a reference implementation when somebody
 * else has to read the output — but nothing here produces OpenAPI for others to
 * consume during import; it reads one and throws it away. What
 * `@apidevtools/swagger-parser` would add is full validation and remote `$ref`
 * fetching, and the second of those is an SSRF surface: a document naming
 * `http://169.254.169.254/` as a `$ref` would have this server fetch it.
 * Internal pointers are the ones real documents use, and they are forty lines.
 *
 * `yaml` *is* a dependency, because a hand-rolled YAML reader is a genuinely
 * bad idea and the package is small, maintained and has no transitive deps.
 */

const MAX_REF_DEPTH = 12;

export type ParseResult =
    | { readonly ok: true; readonly document: unknown }
    | { readonly ok: false; readonly reason: "invalid_syntax" | "too_large" };

/** Re-exported so existing callers keep their name for it. */
export const MAX_DOCUMENT_BYTES = MAX_OPENAPI_DOCUMENT_BYTES;

export async function parseOpenApiText(text: string): Promise<ParseResult> {
    if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    const trimmed = text.trim();

    if (trimmed === "") {
        return { ok: false, reason: "invalid_syntax" };
    }

    // JSON is a subset of YAML, so one path would work — but `JSON.parse` is an
    // order of magnitude faster and most specs are JSON, so it is tried first.
    if (trimmed.startsWith("{")) {
        try {
            return { ok: true, document: dereference(JSON.parse(trimmed)) };
        } catch {
            return { ok: false, reason: "invalid_syntax" };
        }
    }

    try {
        const { parse } = await import("yaml");

        return { ok: true, document: dereference(parse(trimmed) as unknown) };
    } catch (caught) {
        logEvent("warn", "mock_server.openapi_parse_failed", { error: describeError(caught) });

        return { ok: false, reason: "invalid_syntax" };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replaces every internal `$ref` with what it points at.
 *
 * **Internal only.** A `$ref` naming an `http://` URL is left as-is rather than
 * fetched: resolving it would have this server make a request to an address a
 * stranger chose, which is precisely the server-side request forgery the
 * address guard exists to prevent — and there is no reason an import needs it.
 *
 * Depth-capped rather than cycle-tracked. A `User` referring to itself is
 * ordinary, and stopping at a depth leaves a usable partial document where
 * refusing would lose the whole import.
 */
function dereference(document: unknown): unknown {
    const root = document;

    function resolve(node: unknown, depth: number): unknown {
        if (depth > MAX_REF_DEPTH) {
            return null;
        }

        if (Array.isArray(node)) {
            return node.map((item) => resolve(item, depth + 1));
        }

        if (!isRecord(node)) {
            return node;
        }

        const ref = node.$ref;

        if (typeof ref === "string") {
            if (!ref.startsWith("#/")) {
                // External or remote. Left in place, so the mapper sees an
                // object it does not understand and produces `null` rather than
                // this server opening a connection somebody else chose.
                return node;
            }

            const target = pointer(root, ref.slice(2).split("/"));

            return target === undefined ? null : resolve(target, depth + 1);
        }

        const out: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(node)) {
            out[key] = resolve(value, depth + 1);
        }

        return out;
    }

    return resolve(document, 0);
}

/** Walks a JSON Pointer's path, un-escaping the two characters it escapes. */
function pointer(root: unknown, parts: readonly string[]): unknown {
    let current: unknown = root;

    for (const raw of parts) {
        const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");

        if (!isRecord(current)) {
            return undefined;
        }

        current = current[key];
    }

    return current;
}
