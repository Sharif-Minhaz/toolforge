import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { MAX_LOG_ROWS, MAX_LOGGED_PATH_LENGTH } from "../domain/constants";
import type { RequestLogRow } from "../types";

/**
 * The last few calls a server answered.
 *
 * Deliberately narrower than the Mock Server Studio's request log, and the
 * difference is the point rather than an economy. That studio keeps redacted
 * headers and truncated bodies because an *author* is debugging what a client
 * sent them. Here the request bodies **are the visitor's data**, already stored
 * once in `db`, and keeping a second copy of them in a log would mean this
 * service quietly retains more than it says it does. A method, a path, a status
 * and a duration still answer the question people actually have, which is why a
 * client got a 404.
 */

export type LogEntry = {
    readonly serverId: string;
    readonly method: string;
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
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
        await prisma.jsonServerLog.create({
            data: {
                serverId: entry.serverId,
                method: entry.method,
                path: entry.path.slice(0, MAX_LOGGED_PATH_LENGTH),
                status: entry.status,
                durationMs: entry.durationMs,
            },
        });

        await trim(entry.serverId);
    } catch (caught) {
        logEvent("warn", "json_server.log_write_failed", { error: describeError(caught) });
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
    const keep = await prisma.jsonServerLog.findMany({
        where: { serverId },
        orderBy: { createdAt: "desc" },
        take: MAX_LOG_ROWS,
        select: { id: true },
    });

    if (keep.length < MAX_LOG_ROWS) {
        return;
    }

    await prisma.jsonServerLog.deleteMany({
        where: { serverId, id: { notIn: keep.map((row) => row.id) } },
    });
}

export async function listRequestLogs(serverId: string): Promise<readonly RequestLogRow[]> {
    try {
        const rows = await prisma.jsonServerLog.findMany({
            where: { serverId },
            orderBy: { createdAt: "desc" },
            take: MAX_LOG_ROWS,
        });

        return rows.map((row) => ({
            id: row.id,
            method: row.method,
            path: row.path,
            status: row.status,
            durationMs: row.durationMs,
            // ISO-8601: this crosses a Server Action boundary and the locale on
            // the other side does the formatting.
            createdAt: row.createdAt.toISOString(),
        }));
    } catch (caught) {
        logEvent("error", "json_server.log_read_failed", { error: describeError(caught) });

        return [];
    }
}

export async function clearRequestLogs(serverId: string): Promise<void> {
    try {
        await prisma.jsonServerLog.deleteMany({ where: { serverId } });
    } catch (caught) {
        logEvent("warn", "json_server.log_clear_failed", { error: describeError(caught) });
    }
}
