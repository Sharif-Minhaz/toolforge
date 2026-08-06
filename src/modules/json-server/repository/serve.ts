import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { checkServerKey } from "@/modules/tools/domain/server-key";

import { serve } from "../domain/serve";
import type { HttpMethod, JsonDocument, ServeRequest } from "../types";

/**
 * Where a JSON server's data actually lives, and the one place a request is
 * allowed to change it.
 *
 * The engine in `domain/serve.ts` is pure and knows nothing about a database.
 * This file is the whole difference, and it is two paths rather than one:
 *
 * - **A read takes no lock and no transaction.** `document` coming back `null`
 *   from the engine is what says so, and a `GET` is the overwhelming majority of
 *   what this endpoint answers.
 * - **A write takes a row lock for the length of one request.** `json-server`
 *   holds the whole database in memory and rewrites the file, and reproducing
 *   that faithfully means a read-modify-write. Two `POST`s arriving together
 *   would otherwise both read two records, both append a third, and one would
 *   silently vanish — the classic lost update, and the one thing a fixture
 *   server absolutely must not do to somebody's test suite.
 *
 * `SELECT … FOR UPDATE` is what serialises them. It is a row lock, not a table
 * one, so two servers being written at once do not wait on each other; only
 * concurrent writes to *the same* server do, which is exactly the set that
 * conflicts.
 */

export type ServeResult =
    | {
          readonly kind: "answered";
          readonly serverId: string;
          readonly status: number;
          readonly body: string;
          readonly headers: readonly (readonly [string, string])[];
          readonly durationMs: number;
      }
    | { readonly kind: "not_found" }
    | { readonly kind: "paused"; readonly serverId: string }
    | { readonly kind: "unavailable" };

type ServerRow = {
    readonly id: string;
    readonly db: unknown;
    readonly sizeBytes: number;
    readonly isPaused: boolean;
};

export async function serveJsonRequest(
    serverKey: string,
    request: ServeRequest,
): Promise<ServeResult> {
    const key = checkServerKey(serverKey);

    if (!key.ok) {
        return { kind: "not_found" };
    }

    const startedAt = Date.now();

    try {
        const row = await prisma.jsonServer.findUnique({
            where: { key: key.key },
            select: { id: true, db: true, sizeBytes: true, isPaused: true },
        });

        if (row === null) {
            return { kind: "not_found" };
        }

        if (row.isPaused) {
            // 503 rather than 404, so a caller can tell "switched off" from
            // "your address is wrong".
            return { kind: "paused", serverId: row.id };
        }

        return isReadOnly(request.method)
            ? answerRead(row, request, startedAt)
            : await answerWrite(row.id, request, startedAt);
    } catch (caught) {
        logEvent("error", "json_server.serve_failed", { error: describeError(caught) });

        return { kind: "unavailable" };
    }
}

function isReadOnly(method: HttpMethod): boolean {
    return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function answerRead(row: ServerRow, request: ServeRequest, startedAt: number): ServeResult {
    const outcome = serve(request, row.db as JsonDocument, row.sizeBytes);

    return {
        kind: "answered",
        serverId: row.id,
        status: outcome.status,
        body: outcome.body,
        headers: outcome.headers,
        durationMs: Date.now() - startedAt,
    };
}

/**
 * The write path, in one transaction.
 *
 * The lock is taken **before** the document is read, not after, which is the
 * whole point: reading first and locking second leaves the window the lock
 * exists to close. `FOR UPDATE` on a row that another transaction holds simply
 * waits, so the second writer sees the first one's result and appends to it.
 *
 * A method that turns out not to change anything — a `PATCH` that 404s, a write
 * refused by the size lock — still paid for the lock, and that is accepted: the
 * alternative is deciding whether a request writes before running the engine,
 * which is the engine's job and would be a second copy of it here.
 */
async function answerWrite(
    serverId: string,
    request: ServeRequest,
    startedAt: number,
): Promise<ServeResult> {
    const answered = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
            { id: string; db: unknown; size_bytes: number }[]
        >`SELECT id, db, size_bytes FROM json_servers WHERE id = ${serverId}::uuid FOR UPDATE`;

        const row = locked[0];

        if (row === undefined) {
            // Deleted between the read above and this lock. A 404 is the honest
            // answer and is what the next request would say anyway.
            return null;
        }

        const outcome = serve(request, row.db as JsonDocument, row.size_bytes);

        if (outcome.document !== null) {
            await tx.jsonServer.update({
                where: { id: serverId },
                data: {
                    db: outcome.document as Prisma.InputJsonValue,
                    sizeBytes: outcome.bytes,
                },
            });
        }

        return outcome;
    });

    if (answered === null) {
        return { kind: "not_found" };
    }

    return {
        kind: "answered",
        serverId,
        status: answered.status,
        body: answered.body,
        headers: answered.headers,
        durationMs: Date.now() - startedAt,
    };
}
