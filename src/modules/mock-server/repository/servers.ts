import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { MAX_SERVERS_PER_WORKSPACE } from "../domain/constants";
import type { ServerDetail, ServerSummary } from "../types";

/**
 * Servers, and the collections that organise their endpoints.
 *
 * Everything here takes a `workspaceId` that the action layer has already
 * proved the caller owns — see `requireOwnership`. Nothing on this page checks
 * ownership itself, and nothing on this page should: one gate, run once, in the
 * place that knows about cookies.
 */

const SUMMARY_SELECT = {
    id: true,
    key: true,
    name: true,
    description: true,
    isPaused: true,
    createdAt: true,
    _count: { select: { endpoints: true } },
} as const;

type SummaryRow = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isPaused: boolean;
    createdAt: Date;
    _count: { endpoints: number };
};

function toSummary(row: SummaryRow): ServerSummary {
    return {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        isPaused: row.isPaused,
        createdAt: row.createdAt.toISOString(),
        endpointCount: row._count.endpoints,
    };
}

export async function listServers(workspaceId: string): Promise<readonly ServerSummary[]> {
    const rows = await prisma.mockServer.findMany({
        where: { workspaceId },
        select: SUMMARY_SELECT,
        orderBy: { createdAt: "asc" },
    });

    return rows.map(toSummary);
}

export async function countServers(workspaceId: string): Promise<number> {
    return prisma.mockServer.count({ where: { workspaceId } });
}

export async function isServerLimitReached(workspaceId: string): Promise<boolean> {
    return (await countServers(workspaceId)) >= MAX_SERVERS_PER_WORKSPACE;
}

/** Resolves a server *within a workspace*, so a stray id cannot cross tenants. */
export async function findServer(
    workspaceId: string,
    serverId: string,
): Promise<ServerSummary | null> {
    const row = await prisma.mockServer.findFirst({
        where: { id: serverId, workspaceId },
        select: SUMMARY_SELECT,
    });

    return row ? toSummary(row) : null;
}

/** Which workspace a server belongs to — what the ownership gate needs. */
export async function findServerWorkspace(serverId: string): Promise<string | null> {
    const row = await prisma.mockServer.findUnique({
        where: { id: serverId },
        select: { workspaceId: true },
    });

    return row?.workspaceId ?? null;
}

export type InsertServerRow = {
    readonly workspaceId: string;
    readonly key: string;
    readonly name: string;
};

export type InsertServerResult =
    | { readonly ok: true; readonly server: ServerSummary }
    | { readonly ok: false; readonly reason: "key_taken" | "write_failed" };

/**
 * `key` is globally unique, so a collision is a real outcome rather than an
 * exceptional one — two people naming a server `payments` is the ordinary case.
 * It is caught by the constraint rather than by a look-then-insert, which would
 * lose the race between the look and the insert.
 */
export async function insertServer(input: InsertServerRow): Promise<InsertServerResult> {
    try {
        const row = await prisma.mockServer.create({
            data: { workspaceId: input.workspaceId, key: input.key, name: input.name },
            select: SUMMARY_SELECT,
        });

        return { ok: true, server: toSummary(row) };
    } catch (caught) {
        if (isUniqueViolation(caught)) {
            return { ok: false, reason: "key_taken" };
        }

        logEvent("error", "mock_server.server_create_failed", { error: describeError(caught) });

        return { ok: false, reason: "write_failed" };
    }
}

/**
 * Every field optional, so a caller writes only what it is editing.
 *
 * The pause toggle is the reason: sending a name back alongside a boolean it is
 * not changing is how a switch in one tab silently reverts a rename made in
 * another.
 */
export type UpdateServerRow = {
    readonly name?: string;
    readonly description?: string | null;
    readonly isPaused?: boolean;
};

export async function updateServer(serverId: string, input: UpdateServerRow): Promise<boolean> {
    try {
        await prisma.mockServer.update({ where: { id: serverId }, data: input });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.server_update_failed", { error: describeError(caught) });

        return false;
    }
}

export async function deleteServer(serverId: string): Promise<boolean> {
    try {
        await prisma.mockServer.delete({ where: { id: serverId } });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.server_delete_failed", { error: describeError(caught) });

        return false;
    }
}

/** A server with everything the detail page renders, in one round trip. */
export async function findServerDetail(
    workspaceId: string,
    serverId: string,
): Promise<ServerDetail | null> {
    const row = await prisma.mockServer.findFirst({
        where: { id: serverId, workspaceId },
        select: {
            ...SUMMARY_SELECT,
            collections: {
                select: { id: true, parentId: true, name: true, path: true, sortOrder: true },
                orderBy: [{ path: "asc" }],
            },
            endpoints: {
                // Never `graph`: the list renders route, method and name, and a
                // hundred graphs is megabytes nobody asked for.
                select: {
                    id: true,
                    collectionId: true,
                    name: true,
                    method: true,
                    pathPattern: true,
                    isEnabled: true,
                    version: true,
                    updatedAt: true,
                },
                orderBy: [{ pathPattern: "asc" }, { method: "asc" }],
            },
        },
    });

    if (row === null) {
        return null;
    }

    return {
        ...toSummary(row),
        collections: row.collections.map((collection) => ({
            id: collection.id,
            parentId: collection.parentId,
            name: collection.name,
            path: collection.path,
            sortOrder: collection.sortOrder,
        })),
        endpoints: row.endpoints.map((endpoint) => ({
            id: endpoint.id,
            collectionId: endpoint.collectionId,
            name: endpoint.name,
            method: endpoint.method,
            path: endpoint.pathPattern,
            isEnabled: endpoint.isEnabled,
            version: endpoint.version,
            updatedAt: endpoint.updatedAt.toISOString(),
        })),
    };
}

/**
 * Prisma's unique-constraint code. Matched on the shape rather than by
 * importing the error class, which would pull the whole client runtime into
 * anything that wanted to branch on it.
 */
function isUniqueViolation(caught: unknown): boolean {
    return (
        typeof caught === "object" &&
        caught !== null &&
        "code" in caught &&
        (caught as { code?: unknown }).code === "P2002"
    );
}
