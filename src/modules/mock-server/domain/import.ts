import { DEFAULT_CONTENT_TYPE } from "./content-type";
import { autoLayout } from "./graph-edit";
import { DEFAULT_MISSING_VARIABLE, type RequiredField } from "./node-registry";
import { DEFAULT_RESPONSE_BODY, fromJson } from "./value-edit";
import {
    GRAPH_SCHEMA_VERSION,
    type DeclaredRequestShape,
    type GraphDocument,
    type GraphNode,
    type HttpMethod,
    type JsonValue,
    type RequestSource,
} from "../types/graph";

/**
 * What every importer produces, and the graph it produces it as.
 *
 * There are two readers now — `openapi.ts` and `postman.ts` — and the moment
 * there were two, the part that mattered stopped being either of them: the
 * graph. An imported route is a request node carrying what the document said a
 * caller sends, a response node carrying what it said comes back, and — when
 * the document insists on anything — a `validate` node between them wired to a
 * 400 that names what was missing. That shape is the product. Which notation it
 * was read out of is an implementation detail of one file.
 *
 * So this file holds the shape and the builder, and each reader holds only the
 * decisions its own notation forces. A third format is then a file that returns
 * `ImportedDocument` and a branch in `detectImportFormat`, with nothing to
 * re-derive about guards, layout or refusal bodies.
 */

export const IMPORT_FORMATS = ["openapi", "postman"] as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Which notation arrived, from the document itself rather than from the reader.
 *
 * Asked of the parsed value and not of the file name, because the box that
 * matters is a *paste* box — there is no name on what somebody pastes, and
 * making them pick the format from a dropdown is asking a question the first
 * two keys of their document already answer.
 *
 * `null` is a real answer: a JSON file that is neither is refused with the same
 * message as one that will not parse, because "this is not a document this
 * importer reads" is what both of them mean to the reader.
 */
export function detectImportFormat(document: unknown): ImportFormat | null {
    if (!isRecord(document)) {
        return null;
    }

    // The version key, first and on its own: it is the one field both OpenAPI
    // and Swagger guarantee, and no other format claims it.
    if (typeof document.openapi === "string" || typeof document.swagger === "string") {
        return "openapi";
    }

    // A collection is a tree of items. `info.schema` names the version, but it
    // is not worth insisting on — an item array at the root is a collection
    // whatever the export tool wrote about itself.
    if (Array.isArray(document.item)) {
        return "postman";
    }

    return isRecord(document.paths) ? "openapi" : null;
}

export type ImportedEndpoint = {
    readonly method: HttpMethod;
    /** Already in this router's spelling: `:id`, never `{id}` or `{{id}}`. */
    readonly path: string;
    readonly name: string;
    readonly summary: string;
    /**
     * The group the document put it in — an OpenAPI tag, a Postman folder.
     * Empty for an ungrouped operation.
     */
    readonly tag: string;
    readonly status: number;
    readonly contentType: string;
    readonly graph: GraphDocument;
    /** What the document says a request carries. Also written into the graph. */
    readonly declared: DeclaredRequestShape;
    /** What the guard node insists on. Empty when nothing was marked required. */
    readonly required: readonly RequiredField[];
    /**
     * Whether the response body is the document's own, rather than this
     * importer's fallback.
     *
     * Counted and reported, because a collection whose requests were never sent
     * carries no saved responses at all — and an import that quietly gave every
     * one of those routes the same placeholder body, while saying only "12
     * endpoints created", reads as a success that read the document. It did not.
     */
    readonly fromExample: boolean;
};

export type ImportedDocument = {
    readonly title: string;
    readonly endpoints: readonly ImportedEndpoint[];
    /** Paths and operations that could not be mapped, with the reason. */
    readonly skipped: readonly { readonly path: string; readonly reason: string }[];
};

export type ReadImportOptions = {
    /**
     * Whether what the document insists on becomes a guard node. On by
     * default: a mock that accepts what the API it stands in for would refuse
     * is a mock that passes tests the real integration fails.
     */
    readonly enforceRequired?: boolean;
};

/**
 * How many required fields one generated guard may hold.
 *
 * A schema with sixty required properties is a document describing a form, not
 * a contract anybody debugs field by field, and a node listing sixty rows is one
 * nobody can read. What is over the line is left out of the guard rather than
 * silently dropped from the import — the field is still in the declared shape,
 * so the picker still offers it.
 */
export const MAX_REQUIRED_FIELDS = 24;

/** The status a generated guard refuses with. */
export const GUARD_FAILURE_STATUS = 400;

const RESPONSE_BODY_MESSAGE = "Required fields are missing from the request.";

/**
 * Numbers and caps a guard's rows.
 *
 * The identifiers are positional and assigned here rather than by each reader,
 * so two importers cannot disagree about what a `validate` node's rows are
 * called — `requiredFields` in `node-registry.ts` reads them back by shape, and
 * a row without an `id` is dropped on the way in.
 */
export function toRequiredFields(
    fields: readonly { readonly source: RequestSource; readonly path: string }[],
): readonly RequiredField[] {
    return fields.slice(0, MAX_REQUIRED_FIELDS).map((field, index) => ({
        id: `f${index + 1}`,
        source: field.source,
        path: field.path,
    }));
}

/**
 * The graph an imported operation becomes.
 *
 * Without required fields it is the shape every route starts in — request wired
 * to one response — so an import of a document that demands nothing looks
 * exactly like a hand-built route, which is what it is.
 *
 * With them it grows one `validate` node and a second response. That costs the
 * quick body form on the route page, which can only speak for a graph with a
 * single response and steps aside when there are two; the flow editor is where
 * a branching route is edited, and a guard is a branch.
 */
export function buildImportGraph(input: {
    readonly status: number;
    readonly contentType: string;
    /**
     * The response body. `undefined` — not `null` — when the document gave no
     * answer to mock, which is a Postman collection whose requests were never
     * saved with a response; `null` is a document that said the answer is null.
     */
    readonly example: JsonValue | undefined;
    readonly declared: DeclaredRequestShape;
    readonly required: readonly RequiredField[];
}): GraphDocument {
    const entry: GraphNode = {
        id: "request",
        kind: "request",
        position: { x: 0, y: 0 },
        data: { declared: input.declared },
    };

    const success: GraphNode = {
        id: "response",
        kind: "response",
        position: { x: 0, y: 0 },
        data: {
            status: input.status,
            contentType: input.contentType,
            headers: [],
            // A real value tree, not one opaque blob — so the Response Builder
            // can open an imported endpoint and edit it field by field, which is
            // the whole point.
            body: input.example === undefined ? DEFAULT_RESPONSE_BODY : fromJson(input.example),
        },
    };

    if (input.required.length === 0) {
        return {
            schemaVersion: GRAPH_SCHEMA_VERSION,
            nodes: [entry, success],
            edges: [
                {
                    id: "request-response",
                    source: "request",
                    sourceHandle: "next",
                    target: "response",
                },
            ],
        };
    }

    const guard: GraphNode = {
        id: "validate-1",
        kind: "validate",
        position: { x: 0, y: 0 },
        data: {
            fields: input.required as unknown as JsonValue,
            saveAs: DEFAULT_MISSING_VARIABLE,
        },
    };

    const refusal: GraphNode = {
        id: "response-2",
        kind: "response",
        position: { x: 0, y: 0 },
        data: {
            status: GUARD_FAILURE_STATUS,
            contentType: DEFAULT_CONTENT_TYPE,
            headers: [],
            // Not `fromJson`: the point of the refusal is the variable the guard
            // wrote, and a literal copy of the names would say the same thing for
            // every request whatever it actually left out.
            body: {
                kind: "object",
                fields: [
                    { key: "message", value: { kind: "static", value: RESPONSE_BODY_MESSAGE } },
                    { key: "missing", value: { kind: "var", name: DEFAULT_MISSING_VARIABLE } },
                ],
            },
        },
    };

    // Positions come from the same auto-layout the canvas's "Tidy up" runs, so
    // an imported graph opens arranged the way a reader would have arranged it.
    return autoLayout({
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes: [entry, guard, success, refusal],
        edges: [
            {
                id: "request-validate",
                source: "request",
                sourceHandle: "next",
                target: "validate-1",
            },
            { id: "validate-pass", source: "validate-1", sourceHandle: "pass", target: "response" },
            {
                id: "validate-fail",
                source: "validate-1",
                sourceHandle: "fail",
                target: "response-2",
            },
        ],
    });
}
