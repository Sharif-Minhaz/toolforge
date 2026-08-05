import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    LOG_RETENTION_DAYS,
    MAX_LOGS_PER_WORKSPACE,
    type LoggedRequest,
    type LoggedResponse,
    type LoggedTrace,
} from "../domain/log-record";
import type { RequestLogRow } from "../types";

/**
 * Writing and reading request logs.
 *
 * Two things here are deliberate and easy to get wrong.
 *
 * **The write never delays the response.** It is called from `after()` in the
 * route handler, so a mock answers at the same speed whether logging is on or
 * not, and a database that is briefly slow costs the caller nothing.
 *
 * **Retention is enforced on write, probabilistically.** A sweep on every
 * insert would double the cost of the cheapest operation here; a scheduled job
 * would be infrastructure this project does not have. Trimming on roughly one
 * write in twenty keeps the table bounded within a few rows of the cap and
 * costs almost nothing — the same "reset the window at the request rather than
 * on a schedule" trade the quota table makes.
 */

const TRIM_PROBABILITY = 0.05;

export type WriteLogInput = {
    readonly workspaceId: string;
    readonly serverId: string;
    readonly endpointId: string | null;
    readonly method: string;
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
    readonly request: LoggedRequest;
    readonly response: LoggedResponse;
    readonly trace: LoggedTrace | null;
};

export async function writeRequestLog(input: WriteLogInput): Promise<void> {
    try {
        await prisma.requestLog.create({
            data: {
                workspaceId: input.workspaceId,
                serverId: input.serverId,
                endpointId: input.endpointId,
                method: input.method,
                path: input.path,
                status: input.status,
                durationMs: input.durationMs,
                request: input.request as unknown as Prisma.InputJsonValue,
                response: input.response as unknown as Prisma.InputJsonValue,
                trace: (input.trace ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
            },
        });

        if (Math.random() < TRIM_PROBABILITY) {
            await trimWorkspaceLogs(input.workspaceId);
        }
    } catch (caught) {
        // A log that could not be written must never turn into a failed mock
        // response — by the time this runs the caller already has their answer.
        logEvent("error", "mock_server.log_write_failed", { error: describeError(caught) });
    }
}

/**
 * Drops everything past the cap, and everything past the retention window.
 *
 * Two conditions rather than one because they answer different questions: the
 * cap bounds a busy workspace, and the window bounds a quiet one that would
 * otherwise keep a request from months ago indefinitely.
 */
export async function trimWorkspaceLogs(workspaceId: string): Promise<void> {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1_000);

    const survivors = await prisma.requestLog.findMany({
        where: { workspaceId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: MAX_LOGS_PER_WORKSPACE,
    });

    await prisma.requestLog.deleteMany({
        where: {
            workspaceId,
            OR: [{ id: { notIn: survivors.map((row) => row.id) } }, { createdAt: { lt: cutoff } }],
        },
    });
}

export type ListLogsInput = {
    readonly workspaceId: string;
    readonly serverId?: string;
    /** Matched against the path, case-insensitively. */
    readonly search?: string;
    readonly status?: number;
    readonly limit: number;
};

export async function listRequestLogs(input: ListLogsInput): Promise<readonly RequestLogRow[]> {
    const rows = await prisma.requestLog.findMany({
        where: {
            workspaceId: input.workspaceId,
            ...(input.serverId === undefined ? {} : { serverId: input.serverId }),
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.search === undefined || input.search === ""
                ? {}
                : { path: { contains: input.search, mode: "insensitive" } }),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
    });

    return rows.map((row) => ({
        id: row.id,
        serverId: row.serverId,
        endpointId: row.endpointId,
        method: row.method,
        path: row.path,
        status: row.status,
        durationMs: row.durationMs,
        request: row.request as unknown as LoggedRequest,
        response: row.response as unknown as LoggedResponse,
        trace: (row.trace ?? null) as unknown as LoggedTrace | null,
        createdAt: row.createdAt.toISOString(),
    }));
}

export async function clearWorkspaceLogs(workspaceId: string): Promise<boolean> {
    try {
        await prisma.requestLog.deleteMany({ where: { workspaceId } });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.log_clear_failed", { error: describeError(caught) });

        return false;
    }
}
