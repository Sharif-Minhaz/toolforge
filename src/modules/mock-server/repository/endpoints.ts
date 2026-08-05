import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { formatBodyText } from "../domain/body-text";
import { MAX_ENDPOINTS_PER_SERVER } from "../domain/constants";
import { DEFAULT_CONTENT_TYPE } from "../domain/content-type";
import { createDefaultGraph, readGraph } from "../domain/graph";
import type { GraphDocument, HttpMethod } from "../types/graph";
import type { EndpointDetail } from "../types";
import type { ParsedPathPattern } from "../types/routing";

/**
 * Endpoints, and the graph each one carries.
 *
 * The measurements a public request ranks on — `segmentCount`, `specificity`,
 * `hasWildcard` — are written here, from `parsePathPattern`, and never computed
 * at read time. That is the whole reason matching is two indexed queries rather
 * than a scan plus a parse.
 */

const DETAIL_SELECT = {
    id: true,
    serverId: true,
    collectionId: true,
    name: true,
    method: true,
    pathPattern: true,
    isEnabled: true,
    version: true,
    updatedAt: true,
    graph: true,
} as const;

type DetailRow = {
    id: string;
    serverId: string;
    collectionId: string | null;
    name: string;
    method: string;
    pathPattern: string;
    isEnabled: boolean;
    version: number;
    updatedAt: Date;
    graph: unknown;
};

/**
 * Turns a stored row into what the editor renders.
 *
 * Total: a graph that cannot be read still produces a detail — with the default
 * response settings and `graphProblem` set — because a page that refuses to
 * load tells the author nothing about what went wrong with their endpoint.
 */
function toDetail(row: DetailRow): EndpointDetail {
    const base = {
        id: row.id,
        serverId: row.serverId,
        collectionId: row.collectionId,
        name: row.name,
        method: row.method,
        path: row.pathPattern,
        isEnabled: row.isEnabled,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
    };

    const read = readGraph(row.graph);

    if (!read.ok) {
        return {
            ...base,
            status: 200,
            contentType: DEFAULT_CONTENT_TYPE,
            headers: [],
            bodyText: "",
            graphProblem: read.reason,
        };
    }

    const response = read.graph.nodes.find((node) => node.kind === "response");

    if (response === undefined || response.kind !== "response") {
        return {
            ...base,
            status: 200,
            contentType: DEFAULT_CONTENT_TYPE,
            headers: [],
            bodyText: "",
            graphProblem: "no_response_node",
        };
    }

    const { body } = response.data;

    // M1 stores every body as a `static` expression. Anything else is a graph
    // built by a later milestone, and this editor is not the one to open it.
    if (body.kind !== "static") {
        return {
            ...base,
            status: response.data.status,
            contentType: response.data.contentType,
            headers: response.data.headers,
            bodyText: "",
            graphProblem: "unsupported_value",
        };
    }

    return {
        ...base,
        status: response.data.status,
        contentType: response.data.contentType,
        headers: response.data.headers,
        bodyText: formatBodyText(body.value, response.data.contentType),
        graphProblem: null,
    };
}

export async function countEndpoints(serverId: string): Promise<number> {
    return prisma.endpoint.count({ where: { serverId } });
}

export async function isEndpointLimitReached(serverId: string): Promise<boolean> {
    return (await countEndpoints(serverId)) >= MAX_ENDPOINTS_PER_SERVER;
}

export async function findEndpoint(endpointId: string): Promise<EndpointDetail | null> {
    const row = await prisma.endpoint.findUnique({
        where: { id: endpointId },
        select: DETAIL_SELECT,
    });

    return row ? toDetail(row) : null;
}

/** Which workspace an endpoint sits under — what the ownership gate needs. */
export async function findEndpointWorkspace(endpointId: string): Promise<string | null> {
    const row = await prisma.endpoint.findUnique({
        where: { id: endpointId },
        select: { server: { select: { workspaceId: true } } },
    });

    return row?.server.workspaceId ?? null;
}

export type InsertEndpointRow = {
    readonly serverId: string;
    readonly collectionId: string | null;
    readonly name: string;
    readonly method: HttpMethod;
    readonly parsed: ParsedPathPattern;
};

export type EndpointWriteResult =
    | { readonly ok: true; readonly endpoint: EndpointDetail }
    | { readonly ok: false; readonly reason: "route_taken" | "version_conflict" | "write_failed" };

export async function insertEndpoint(input: InsertEndpointRow): Promise<EndpointWriteResult> {
    try {
        const row = await prisma.endpoint.create({
            data: {
                serverId: input.serverId,
                collectionId: input.collectionId,
                name: input.name,
                method: input.method,
                pathPattern: input.parsed.pattern,
                segmentCount: input.parsed.segmentCount,
                specificity: input.parsed.specificity,
                hasWildcard: input.parsed.hasWildcard,
                // Prisma's JSON input type excludes `null` at the top level; a
                // `GraphDocument` is never null, so the cast asserts what the
                // type system cannot see through the structural mismatch.
                graph: createDefaultGraph() as unknown as Prisma.InputJsonValue,
            },
            select: DETAIL_SELECT,
        });

        return { ok: true, endpoint: toDetail(row) };
    } catch (caught) {
        if (isUniqueViolation(caught)) {
            return { ok: false, reason: "route_taken" };
        }

        logEvent("error", "mock_server.endpoint_create_failed", { error: describeError(caught) });

        return { ok: false, reason: "write_failed" };
    }
}

export type UpdateEndpointRow = {
    readonly endpointId: string;
    readonly version: number;
    readonly name: string;
    readonly method: HttpMethod;
    readonly parsed: ParsedPathPattern;
    readonly isEnabled: boolean;
    readonly graph: GraphDocument;
};

/**
 * Saves an endpoint, asserting the version it was read at.
 *
 * `updateMany` rather than `update` because it reports how many rows it
 * touched: zero means another tab saved first, which is the normal case with
 * two studio windows open and not an exceptional one. Last-write-wins would
 * silently discard whichever author was slower.
 */
export async function updateEndpoint(input: UpdateEndpointRow): Promise<EndpointWriteResult> {
    try {
        const updated = await prisma.endpoint.updateMany({
            where: { id: input.endpointId, version: input.version },
            data: {
                name: input.name,
                method: input.method,
                pathPattern: input.parsed.pattern,
                segmentCount: input.parsed.segmentCount,
                specificity: input.parsed.specificity,
                hasWildcard: input.parsed.hasWildcard,
                isEnabled: input.isEnabled,
                graph: input.graph as unknown as Prisma.InputJsonValue,
                version: { increment: 1 },
            },
        });

        if (updated.count === 0) {
            // Either the version moved or the row is gone. Both are "reload and
            // look" for the author, and telling them apart would need a second
            // query to answer a question the UI does not ask.
            return { ok: false, reason: "version_conflict" };
        }

        const row = await prisma.endpoint.findUnique({
            where: { id: input.endpointId },
            select: DETAIL_SELECT,
        });

        return row
            ? { ok: true, endpoint: toDetail(row) }
            : { ok: false, reason: "version_conflict" };
    } catch (caught) {
        if (isUniqueViolation(caught)) {
            return { ok: false, reason: "route_taken" };
        }

        logEvent("error", "mock_server.endpoint_update_failed", { error: describeError(caught) });

        return { ok: false, reason: "write_failed" };
    }
}

export async function deleteEndpoint(endpointId: string): Promise<boolean> {
    try {
        await prisma.endpoint.delete({ where: { id: endpointId } });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.endpoint_delete_failed", { error: describeError(caught) });

        return false;
    }
}

function isUniqueViolation(caught: unknown): boolean {
    return (
        typeof caught === "object" &&
        caught !== null &&
        "code" in caught &&
        (caught as { code?: unknown }).code === "P2002"
    );
}
