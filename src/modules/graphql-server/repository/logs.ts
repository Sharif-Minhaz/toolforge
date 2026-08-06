import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { MAX_LOG_ROWS, MAX_LOGGED_NAME_LENGTH } from "../domain/constants";
import type { RequestLogRow } from "../types";

/**
 * The last few operations a server answered.
 *
 * **The operation name, never the query text.** The REST studio logs a method
 * and a path, which are small and say nothing the document does not already
 * say. A GraphQL request's equivalent would be the whole query document — which
 * is largely the visitor's own field names against their own data, already
 * stored once in `db` — so logging it would mean this service quietly retains
 * more than it says it does. What is kept still answers the question people
 * actually have, which is why an operation was refused.
 *
 * `cost` is the one column with no REST equivalent, and it is here because it is
 * the only thing that tells a 400 for "too costly" apart from a 400 for
 * "invalid": without it, the two are one number in a table and the fix for each
 * is completely different.
 */

export type LogEntry = {
    readonly serverId: string;
    readonly operationName: string | null;
    readonly operationType: string;
    readonly status: number;
    readonly durationMs: number;
    readonly cost: number;
};

/**
 * Writes one row and trims the tail.
 *
 * Called from the route handler's `after()`, so a server answers at the same
 * speed whether logging succeeds or not — and a briefly slow database costs the
 * caller nothing. Every failure here is swallowed for the same reason: a log
 * that could break a working API would be worse than no log.
 */
export async function writeRequestLog(entry: LogEntry): Promise<void> {
    try {
        await prisma.graphqlServerLog.create({
            data: {
                serverId: entry.serverId,
                operationName: entry.operationName?.slice(0, MAX_LOGGED_NAME_LENGTH) ?? null,
                operationType: entry.operationType,
                status: entry.status,
                durationMs: entry.durationMs,
                cost: entry.cost,
            },
        });

        await trim(entry.serverId);
    } catch (caught) {
        logEvent("warn", "graphql_server.log_write_failed", { error: describeError(caught) });
    }
}

/**
 * Keeps the newest `MAX_LOG_ROWS` and drops the rest.
 *
 * Two statements rather than a window function, because the id is a UUIDv7 and
 * therefore not ordered by insertion in a way `DELETE … LIMIT` could use. The
 * read is index-covered — `(server_id, created_at DESC)` — so this is one seek
 * and a small delete rather than a scan.
 */
async function trim(serverId: string): Promise<void> {
    const keep = await prisma.graphqlServerLog.findMany({
        where: { serverId },
        orderBy: { createdAt: "desc" },
        take: MAX_LOG_ROWS,
        select: { id: true },
    });

    if (keep.length < MAX_LOG_ROWS) {
        return;
    }

    await prisma.graphqlServerLog.deleteMany({
        where: { serverId, id: { notIn: keep.map((row) => row.id) } },
    });
}

export async function listRequestLogs(serverId: string): Promise<readonly RequestLogRow[]> {
    try {
        const rows = await prisma.graphqlServerLog.findMany({
            where: { serverId },
            orderBy: { createdAt: "desc" },
            take: MAX_LOG_ROWS,
        });

        return rows.map((row) => ({
            id: row.id,
            operationName: row.operationName,
            operationType: row.operationType,
            status: row.status,
            durationMs: row.durationMs,
            cost: row.cost,
            // ISO-8601: this crosses a Server Action boundary and the locale on
            // the other side does the formatting.
            createdAt: row.createdAt.toISOString(),
        }));
    } catch (caught) {
        logEvent("error", "graphql_server.log_read_failed", { error: describeError(caught) });

        return [];
    }
}

export async function clearRequestLogs(serverId: string): Promise<void> {
    try {
        await prisma.graphqlServerLog.deleteMany({ where: { serverId } });
    } catch (caught) {
        logEvent("warn", "graphql_server.log_clear_failed", { error: describeError(caught) });
    }
}
