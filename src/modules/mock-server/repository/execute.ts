import "server-only";

import { prisma } from "@/lib/prisma";

import { MAX_PATH_SEGMENTS } from "../domain/constants";
import { splitRequestPath } from "../domain/path-pattern";
import type { HttpMethod } from "../types/graph";
import type { EndpointRoute } from "../types/routing";

/**
 * The hot path: everything a public request touches, and nothing else.
 *
 * Two queries, both indexed, and the split between them is the point.
 *
 * **The first must not select `graph`.** Twenty candidates at 100 KB each is
 * two megabytes of JSON fetched to answer one request. `EndpointRoute` is
 * typed narrower than the row precisely so that selecting the graph here would
 * be a type error rather than a slow afternoon.
 *
 * **The method is not in the `where` clause.** It cannot be: telling a 404 from
 * a 405 requires knowing which methods the *path* supports, so the candidate
 * set is every enabled route whose shape could match, and the method decision
 * happens in `matchEndpoint` over that set.
 */

export type ServerRow = {
    readonly id: string;
    readonly workspaceId: string;
    readonly isPaused: boolean;
};

export async function findServerByKey(key: string): Promise<ServerRow | null> {
    return prisma.mockServer.findUnique({
        where: { key },
        select: { id: true, workspaceId: true, isPaused: true },
    });
}

/**
 * Candidate routes for one incoming path.
 *
 * Narrowed on segment count, which is the cheap half of matching and the half
 * an index can do: a pattern of n segments can only match a path of n, and a
 * wildcard pattern of n can only match a path of n or more. Everything left is
 * ranked in memory by `matchEndpoint`.
 */
export async function findCandidateRoutes(
    serverId: string,
    path: string,
): Promise<readonly EndpointRoute[]> {
    const segmentCount = splitRequestPath(path).length;

    if (segmentCount > MAX_PATH_SEGMENTS) {
        // Longer than anything that could have been stored, so no query is
        // worth making. A scripted walk of deep paths costs nothing here.
        return [];
    }

    const rows = await prisma.endpoint.findMany({
        where: {
            serverId,
            isEnabled: true,
            OR: [{ segmentCount }, { hasWildcard: true, segmentCount: { lte: segmentCount } }],
        },
        select: {
            id: true,
            method: true,
            pathPattern: true,
            segmentCount: true,
            specificity: true,
            hasWildcard: true,
        },
    });

    return rows.map((row) => ({
        id: row.id,
        method: row.method as HttpMethod,
        pattern: row.pathPattern,
        segmentCount: row.segmentCount,
        specificity: row.specificity,
        hasWildcard: row.hasWildcard,
    }));
}

/** The winner's graph, and only the winner's. */
export async function findEndpointGraph(endpointId: string): Promise<unknown | null> {
    const row = await prisma.endpoint.findUnique({
        where: { id: endpointId },
        select: { graph: true },
    });

    return row?.graph ?? null;
}
