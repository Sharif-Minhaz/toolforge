import { readGraph } from "./graph";
import { parsePathPattern } from "./path-pattern";
import type { GraphDocument, HttpMethod, JsonValue } from "../types/graph";

/**
 * A whole mock server as one JSON file.
 *
 * The OpenAPI export next to this one answers a different question. OpenAPI
 * describes an API *to other tools*, and it is lossy on purpose: a value tree
 * that generates a different name on every call has no OpenAPI spelling, so it
 * goes out as one example. This is the other half — everything this studio
 * knows, in the shape it knows it, so a server can be backed up, committed,
 * diffed and put back.
 *
 * Three decisions worth writing down.
 *
 * **The graph is exported whole, not the response form's view of it.** The
 * response body, the delays, the branches, the auth node — all of it lives in
 * `graph`, and anything that summarised it instead would export a mock that
 * answers differently from the one it came from.
 *
 * **There is no timestamp in the file.** The obvious `exportedAt` makes two
 * exports of an unchanged server differ, which ruins the main reason to have
 * this: committing it and seeing what actually changed. The date belongs in the
 * filename, where it costs a diff nothing.
 *
 * **Ids and counts are left out.** A workspace id, an endpoint id and a created
 * date describe *this* installation's row, not the mock — and re-importing a
 * file that names ids would either collide or quietly renumber. What is here is
 * everything needed to rebuild the server somewhere else, and nothing that only
 * makes sense where it came from.
 */

export const BUNDLE_FORMAT = "toolforge.mock-server";

/**
 * Bumped when a reader written for version 1 would misread a version 2 file.
 * Adding an optional field does not qualify; changing what a field means does.
 */
export const BUNDLE_VERSION = 1;

export type BundleEndpoint = {
    readonly method: HttpMethod;
    readonly path: string;
    readonly name: string;
    readonly description: string | null;
    readonly isEnabled: boolean;
    readonly graph: GraphDocument;
};

export type ServerBundle = {
    readonly format: typeof BUNDLE_FORMAT;
    readonly version: number;
    readonly server: {
        readonly key: string;
        readonly name: string;
        readonly description: string | null;
        readonly isPaused: boolean;
    };
    readonly endpoints: readonly BundleEndpoint[];
};

export type BundleInput = {
    readonly key: string;
    readonly name: string;
    readonly description: string | null;
    readonly isPaused: boolean;
    readonly endpoints: readonly BundleEndpoint[];
};

/** Field order is fixed, so a re-export of unchanged work is byte-identical. */
export function buildBundle(input: BundleInput): ServerBundle {
    return {
        format: BUNDLE_FORMAT,
        version: BUNDLE_VERSION,
        server: {
            key: input.key,
            name: input.name,
            description: input.description,
            isPaused: input.isPaused,
        },
        endpoints: input.endpoints.map((endpoint) => ({
            method: endpoint.method,
            path: endpoint.path,
            name: endpoint.name,
            description: endpoint.description,
            isEnabled: endpoint.isEnabled,
            graph: endpoint.graph,
        })),
    };
}

/** Four spaces and a trailing newline, so the file is a well-behaved text file. */
export function serializeBundle(bundle: ServerBundle): string {
    return `${JSON.stringify(bundle, null, 4)}\n`;
}

/**
 * The filename, dated.
 *
 * The date is the one thing that has to change between two exports of the same
 * server and must not be inside the file — see the note above. `at` is passed
 * in rather than read, because `domain/` does not own a clock.
 */
export function bundleFilename(key: string, at: Date): string {
    return `${key}-${at.toISOString().slice(0, 10)}.json`;
}

export const BUNDLE_PROBLEMS = [
    "not_an_object",
    "wrong_format",
    "unsupported_version",
    "no_endpoints",
] as const;

export type BundleProblem = (typeof BUNDLE_PROBLEMS)[number];

export type BundleResult =
    | { readonly ok: true; readonly bundle: ServerBundle; readonly skipped: readonly string[] }
    | { readonly ok: false; readonly reason: BundleProblem };

/**
 * Reads a file back, defensively.
 *
 * Nothing consumes this yet — importing a bundle is the other half and is not
 * built. It ships now because it is what makes the *export* format a contract
 * rather than a dump: writing the reader alongside the writer is how the two
 * are kept honest, and the round-trip test below is the only thing that proves
 * the file contains enough to rebuild a server from.
 *
 * One unusable endpoint is skipped by name rather than failing the file, the
 * same rule the OpenAPI import follows: three hundred and ninety-seven working
 * routes and a list beats an error and nothing.
 */
export function readBundle(value: unknown): BundleResult {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, reason: "not_an_object" };
    }

    const raw = value as Record<string, JsonValue>;

    if (raw.format !== BUNDLE_FORMAT) {
        return { ok: false, reason: "wrong_format" };
    }

    if (typeof raw.version !== "number" || raw.version > BUNDLE_VERSION) {
        return { ok: false, reason: "unsupported_version" };
    }

    const server = readServer(raw.server);

    if (server === null) {
        return { ok: false, reason: "not_an_object" };
    }

    const endpoints: BundleEndpoint[] = [];
    const skipped: string[] = [];

    for (const entry of Array.isArray(raw.endpoints) ? raw.endpoints : []) {
        const endpoint = readEndpoint(entry);

        if (endpoint === null) {
            skipped.push(describeEntry(entry));
            continue;
        }

        endpoints.push(endpoint);
    }

    if (endpoints.length === 0) {
        return { ok: false, reason: "no_endpoints" };
    }

    return { ok: true, bundle: buildBundle({ ...server, endpoints }), skipped };
}

function readServer(value: JsonValue | undefined): Omit<BundleInput, "endpoints"> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }

    const raw = value as Record<string, JsonValue>;

    if (typeof raw.key !== "string" || typeof raw.name !== "string") {
        return null;
    }

    return {
        key: raw.key,
        name: raw.name,
        description: typeof raw.description === "string" ? raw.description : null,
        isPaused: raw.isPaused === true,
    };
}

function readEndpoint(value: JsonValue): BundleEndpoint | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }

    const raw = value as Record<string, JsonValue>;

    if (typeof raw.method !== "string" || typeof raw.path !== "string") {
        return null;
    }

    // The path is re-parsed rather than trusted: a hand-edited file is the
    // ordinary case for something meant to be committed, and a pattern this
    // router cannot match is worth losing one route over rather than storing.
    const path = parsePathPattern(raw.path);
    const graph = readGraph(raw.graph);

    if (!path.ok || !graph.ok) {
        return null;
    }

    return {
        method: raw.method as HttpMethod,
        path: path.parsed.pattern,
        name:
            typeof raw.name === "string" && raw.name !== ""
                ? raw.name
                : `${raw.method} ${raw.path}`,
        description: typeof raw.description === "string" ? raw.description : null,
        // Absent means enabled: a file written by hand should not have to say
        // so, and only an explicit `false` switches a route off.
        isEnabled: raw.isEnabled !== false,
        graph: graph.graph,
    };
}

function describeEntry(value: JsonValue): string {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const raw = value as Record<string, JsonValue>;

        if (typeof raw.path === "string") {
            return `${typeof raw.method === "string" ? raw.method : "?"} ${raw.path}`;
        }
    }

    return "?";
}
