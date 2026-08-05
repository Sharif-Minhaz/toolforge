import { DEFAULT_CONTENT_TYPE } from "./content-type";
import { MAX_ENDPOINTS_PER_SERVER, MAX_PATH_SEGMENTS } from "./constants";
import { createDefaultGraph } from "./graph";
import { parsePathPattern } from "./path-pattern";
import { fromJson } from "./value-edit";
import { HTTP_METHODS, type GraphDocument, type HttpMethod, type JsonValue } from "../types/graph";

/**
 * Turning an OpenAPI document into endpoints.
 *
 * Pure and dependency-free. Parsing YAML and resolving `$ref` happen in
 * `repository/openapi.ts`, where the parser lives; by the time anything reaches
 * this file it is a plain JavaScript value. That split is what lets the
 * mapping — which is the part with all the decisions in it — be unit-tested
 * against fixtures with no I/O and no three-megabyte import.
 *
 * The decisions worth knowing about:
 *
 * **A schema becomes an example, not a validator.** A mock's job is to return
 * something shaped right, so `type: object` with two properties becomes an
 * object with two fields carrying plausible values. Where the document supplies
 * `example` or `default`, that wins — an author's own sample beats anything
 * generated from the type.
 *
 * **`$ref` cycles are survivable.** A `User` with a `friends: User[]` is
 * ordinary and would recurse forever. Depth is capped and the cycle terminates
 * as `null`, which is a legitimate value rather than a crash.
 *
 * **Paths are rewritten, not passed through.** OpenAPI writes `{id}` and this
 * router writes `:id`. Getting that wrong produces endpoints that look right in
 * the list and match nothing.
 */

const MAX_SCHEMA_DEPTH = 8;

const MAX_EXAMPLE_ARRAY = 2;

export type OpenApiEndpoint = {
    readonly method: HttpMethod;
    /** Already in this router's spelling: `:id`, never `{id}`. */
    readonly path: string;
    readonly name: string;
    readonly summary: string;
    /** The first tag, which becomes a collection. Empty for untagged. */
    readonly tag: string;
    readonly status: number;
    readonly contentType: string;
    readonly graph: GraphDocument;
};

export type OpenApiImport = {
    readonly title: string;
    readonly endpoints: readonly OpenApiEndpoint[];
    /** Paths and operations that could not be mapped, with the reason. */
    readonly skipped: readonly { readonly path: string; readonly reason: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `/users/{userId}/posts` → `/users/:userId/posts`. */
export function toRoutePattern(openApiPath: string): string {
    return openApiPath.replace(
        /\{([^}]+)\}/gu,
        (_match, name: string) =>
            // A parameter name OpenAPI allows but this router does not — a hyphen,
            // say — is stripped to something it does, rather than failing the whole
            // import over one path.
            `:${name.replace(/[^A-Za-z0-9_]/gu, "_")}`,
    );
}

/**
 * A plausible value for a schema.
 *
 * Depth-capped and total: anything unrecognised becomes `null`, which is valid
 * JSON and does not stop an import.
 */
export function exampleFromSchema(schema: unknown, depth = 0): JsonValue {
    if (depth > MAX_SCHEMA_DEPTH || !isRecord(schema)) {
        return null;
    }

    // The author's own sample always wins over anything derived from the type.
    if ("example" in schema) {
        return schema.example as JsonValue;
    }

    if ("default" in schema) {
        return schema.default as JsonValue;
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        return schema.enum[0] as JsonValue;
    }

    // `allOf` is a merge, and merging the examples is the only reading that
    // produces something with every required field in it.
    if (Array.isArray(schema.allOf)) {
        const merged: Record<string, JsonValue> = {};

        for (const part of schema.allOf) {
            const value = exampleFromSchema(part, depth + 1);

            if (isRecord(value)) {
                Object.assign(merged, value);
            }
        }

        return merged;
    }

    // `oneOf` and `anyOf` are a choice, and the first branch is the one a
    // reader will recognise as "the normal case" often enough to be useful.
    for (const key of ["oneOf", "anyOf"] as const) {
        const branches = schema[key];

        if (Array.isArray(branches) && branches.length > 0) {
            return exampleFromSchema(branches[0], depth + 1);
        }
    }

    const type = typeof schema.type === "string" ? schema.type : inferType(schema);

    switch (type) {
        case "object": {
            const properties = isRecord(schema.properties) ? schema.properties : {};
            const out: Record<string, JsonValue> = {};

            for (const [name, child] of Object.entries(properties)) {
                out[name] = exampleFromSchema(child, depth + 1);
            }

            return out;
        }

        case "array":
            return Array.from({ length: MAX_EXAMPLE_ARRAY }, () =>
                exampleFromSchema(schema.items, depth + 1),
            );

        case "integer":
        case "number":
            return 0;

        case "boolean":
            return true;

        case "null":
            return null;

        default:
            return exampleString(schema);
    }
}

/** A string shaped like its format, so a date field looks like a date. */
function exampleString(schema: Record<string, unknown>): string {
    switch (schema.format) {
        case "date-time":
            return "2026-01-01T00:00:00.000Z";
        case "date":
            return "2026-01-01";
        case "email":
            return "user@example.com";
        case "uuid":
            return "00000000-0000-4000-8000-000000000000";
        case "uri":
        case "url":
            return "https://example.com";
        default:
            return "string";
    }
}

/** A schema with properties and no `type` is an object; JSON Schema allows it. */
function inferType(schema: Record<string, unknown>): string {
    if (isRecord(schema.properties)) {
        return "object";
    }

    return "items" in schema ? "array" : "string";
}

/**
 * The response an operation should mock.
 *
 * The lowest 2xx, because that is what a caller expects when things go right;
 * `default` only if there is no success code at all. Picking the first key in
 * document order instead would return a 404 example for an operation that
 * happens to list its errors first.
 */
export function pickResponse(responses: unknown): {
    status: number;
    schema: unknown;
    contentType: string;
} {
    if (!isRecord(responses)) {
        return { status: 200, schema: undefined, contentType: DEFAULT_CONTENT_TYPE };
    }

    const codes = Object.keys(responses)
        .filter((code) => /^\d{3}$/u.test(code))
        .map(Number)
        .toSorted((a, b) => a - b);

    const success = codes.find((code) => code >= 200 && code < 300);
    const chosen = success ?? codes[0];
    const key = chosen === undefined ? "default" : String(chosen);
    const body = responses[key];

    if (!isRecord(body)) {
        return { status: chosen ?? 200, schema: undefined, contentType: DEFAULT_CONTENT_TYPE };
    }

    const content = isRecord(body.content) ? body.content : {};
    const jsonKey =
        Object.keys(content).find((type) => type.includes("json")) ?? Object.keys(content)[0];
    const media = jsonKey === undefined ? undefined : content[jsonKey];

    return {
        status: chosen ?? 200,
        schema: isRecord(media) ? media.schema : undefined,
        // Anything the allowlist refuses collapses at serve time; recording what
        // the document said keeps the import honest about what it read.
        contentType: jsonKey ?? DEFAULT_CONTENT_TYPE,
    };
}

/**
 * Reads a dereferenced OpenAPI document into endpoints.
 *
 * Total: every operation it cannot map lands in `skipped` with a reason rather
 * than failing the import. A four-hundred-endpoint document with three odd
 * paths in it should produce three hundred and ninety-seven endpoints and a
 * list, not an error.
 */
export function readOpenApi(document: unknown): OpenApiImport {
    if (!isRecord(document)) {
        return { title: "", endpoints: [], skipped: [{ path: "", reason: "not_a_document" }] };
    }

    const info = isRecord(document.info) ? document.info : {};
    const title = typeof info.title === "string" ? info.title : "";
    const paths = isRecord(document.paths) ? document.paths : {};

    const endpoints: OpenApiEndpoint[] = [];
    const skipped: { path: string; reason: string }[] = [];

    for (const [rawPath, item] of Object.entries(paths)) {
        if (!isRecord(item)) {
            skipped.push({ path: rawPath, reason: "not_an_object" });
            continue;
        }

        const pattern = parsePathPattern(toRoutePattern(rawPath));

        if (!pattern.ok) {
            skipped.push({ path: rawPath, reason: pattern.reason });
            continue;
        }

        if (pattern.parsed.segmentCount > MAX_PATH_SEGMENTS) {
            skipped.push({ path: rawPath, reason: "too_many_segments" });
            continue;
        }

        for (const method of HTTP_METHODS) {
            const operation = item[method.toLowerCase()];

            if (!isRecord(operation)) {
                continue;
            }

            if (endpoints.length >= MAX_ENDPOINTS_PER_SERVER) {
                skipped.push({ path: rawPath, reason: "endpoint_limit_reached" });
                break;
            }

            const response = pickResponse(operation.responses);
            const example = exampleFromSchema(response.schema);
            const summary =
                typeof operation.summary === "string"
                    ? operation.summary
                    : typeof operation.description === "string"
                      ? operation.description
                      : "";

            const base = createDefaultGraph();

            endpoints.push({
                method,
                path: pattern.parsed.pattern,
                name:
                    typeof operation.operationId === "string" && operation.operationId !== ""
                        ? operation.operationId
                        : `${method} ${pattern.parsed.pattern}`,
                summary,
                tag:
                    Array.isArray(operation.tags) && typeof operation.tags[0] === "string"
                        ? operation.tags[0]
                        : "",
                status: response.status,
                contentType: response.contentType,
                graph: {
                    ...base,
                    nodes: base.nodes.map((node) =>
                        node.kind === "response"
                            ? {
                                  ...node,
                                  data: {
                                      ...node.data,
                                      status: response.status,
                                      contentType: response.contentType,
                                      // A real value tree, not one opaque blob —
                                      // so the Response Builder can open an
                                      // imported endpoint and edit it field by
                                      // field, which is the whole point.
                                      body: fromJson(example),
                                  },
                              }
                            : node,
                    ),
                },
            });
        }
    }

    return { title, endpoints, skipped };
}

/**
 * The reverse: a server's endpoints as an OpenAPI 3.1 document.
 *
 * Deliberately thin. What this can honestly describe is the routes and the
 * status codes; the response *schema* is not recoverable from a value tree that
 * may generate a different shape per call, so each operation carries an example
 * rather than a schema. Emitting a schema derived from one sample would be a
 * confident claim about a contract nobody made.
 */
export type ExportEndpoint = {
    readonly method: string;
    readonly path: string;
    readonly name: string;
    readonly status: number;
    readonly contentType: string;
    readonly example: JsonValue;
};

export function writeOpenApi(
    title: string,
    baseUrl: string,
    endpoints: readonly ExportEndpoint[],
): JsonValue {
    const paths: Record<string, Record<string, JsonValue>> = {};

    for (const endpoint of endpoints) {
        // Back to OpenAPI's spelling on the way out.
        const key = endpoint.path.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
        const parameters = [...endpoint.path.matchAll(/:([A-Za-z0-9_]+)/gu)].map(([, name]) => ({
            name,
            in: "path",
            required: true,
            schema: { type: "string" },
        }));

        paths[key] ??= {};
        paths[key][endpoint.method.toLowerCase()] = {
            summary: endpoint.name,
            ...(parameters.length > 0 ? { parameters } : {}),
            responses: {
                [String(endpoint.status)]: {
                    description: "Mock response",
                    content: { [endpoint.contentType]: { example: endpoint.example } },
                },
            },
        } as JsonValue;
    }

    return {
        openapi: "3.1.0",
        info: { title, version: "1.0.0" },
        servers: [{ url: baseUrl }],
        paths: paths as unknown as JsonValue,
    };
}
