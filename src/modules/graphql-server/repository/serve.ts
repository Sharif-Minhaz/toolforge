import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { checkServerKey } from "@/modules/tools/domain/server-key";
import type { JsonDocument } from "@/modules/tools/types/json-document";

import { executeRequest, planRequest, refuse } from "../domain/execute";
import type { GraphqlOutcome, GraphqlRequest } from "../types";

/**
 * Where a GraphQL server's data actually lives, and the one place a request is
 * allowed to change it.
 *
 * The engine in `domain/execute.ts` is pure and knows nothing about a database.
 * This file is the whole difference, and it is two paths rather than one:
 *
 * - **A query takes no lock and no transaction.**
 * - **A mutation takes a row lock for the length of one request.** Every write
 *   is a read-modify-write over the whole JSONB document, so two mutations
 *   arriving together would otherwise both read two records, both append a
 *   third, and one would silently vanish — the classic lost update, and the one
 *   thing a fixture server absolutely must not do to somebody's test suite.
 *
 * **Which of the two a request is cannot be read from the HTTP method here.**
 * That is the real difference from the REST studio's equivalent, where a `GET`
 * is a read by definition: every GraphQL request is a `POST`, so the only thing
 * that can answer the question is the parsed operation. `planRequest` does
 * exactly that much work and no more — parse, find the operation, read its type
 * — and the parsed AST is then handed on, so the document is parsed once rather
 * than once per path.
 *
 * `SELECT … FOR UPDATE` is what serialises the writes. It is a row lock, not a
 * table one, so two servers being written at once do not wait on each other;
 * only concurrent mutations to *the same* server do, which is exactly the set
 * that conflicts.
 */

export type ServeResult =
    | {
          readonly kind: "answered";
          readonly serverId: string;
          readonly outcome: GraphqlOutcome;
          readonly operationType: string;
          readonly durationMs: number;
      }
    | { readonly kind: "not_found" }
    | { readonly kind: "paused"; readonly serverId: string }
    | { readonly kind: "unavailable" };

export async function serveGraphqlRequest(
    serverKey: string,
    request: GraphqlRequest,
): Promise<ServeResult> {
    const key = checkServerKey(serverKey);

    if (!key.ok) {
        return { kind: "not_found" };
    }

    const startedAt = Date.now();

    // Planned before the row is read. A query that cannot parse costs no
    // database work at all, which matters because a malformed query is exactly
    // what a scripted probe sends.
    const plan = planRequest(request);

    if (!plan.ok) {
        const row = await findServer(key.key);

        if (row === null) {
            // A bad query against a server that does not exist is a 404, not a
            // 400. Answering 400 would confirm the key exists to anyone walking
            // the keyspace with deliberately broken queries.
            return { kind: "not_found" };
        }

        if (row.isPaused) {
            return { kind: "paused", serverId: row.id };
        }

        return {
            kind: "answered",
            serverId: row.id,
            outcome: refuse(400, plan.reason, plan.message, null),
            operationType: "unknown",
            durationMs: Date.now() - startedAt,
        };
    }

    try {
        const row = await findServer(key.key);

        if (row === null) {
            return { kind: "not_found" };
        }

        if (row.isPaused) {
            // 503 rather than 404, so a caller can tell "switched off" from
            // "your address is wrong".
            return { kind: "paused", serverId: row.id };
        }

        const operationType = plan.isMutation ? "mutation" : "query";

        if (!plan.isMutation) {
            return {
                kind: "answered",
                serverId: row.id,
                outcome: executeRequest(plan, request, row.db as JsonDocument, row.sizeBytes),
                operationType,
                durationMs: Date.now() - startedAt,
            };
        }

        const answered = await answerMutation(row.id, plan, request);

        if (answered === null) {
            return { kind: "not_found" };
        }

        return {
            kind: "answered",
            serverId: row.id,
            outcome: answered,
            operationType,
            durationMs: Date.now() - startedAt,
        };
    } catch (caught) {
        logEvent("error", "graphql_server.serve_failed", { error: describeError(caught) });

        return { kind: "unavailable" };
    }
}

async function findServer(key: string) {
    return prisma.graphqlServer.findUnique({
        where: { key },
        select: { id: true, db: true, sizeBytes: true, isPaused: true },
    });
}

/**
 * The write path, in one transaction.
 *
 * The lock is taken **before** the document is read, not after, which is the
 * whole point: reading first and locking second leaves the window the lock
 * exists to close. `FOR UPDATE` on a row that another transaction holds simply
 * waits, so the second writer sees the first one's result and appends to it.
 *
 * A mutation that turns out to change nothing — one that 404s, or is refused by
 * the size lock — still paid for the lock, and that is accepted: the alternative
 * is deciding whether an operation writes before running it, which is the
 * engine's job and would be a second copy of it here.
 */
async function answerMutation(
    serverId: string,
    plan: Extract<ReturnType<typeof planRequest>, { ok: true }>,
    request: GraphqlRequest,
): Promise<GraphqlOutcome | null> {
    return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
            { id: string; db: unknown; size_bytes: number }[]
        >`SELECT id, db, size_bytes FROM graphql_servers WHERE id = ${serverId}::uuid FOR UPDATE`;

        const row = locked[0];

        if (row === undefined) {
            // Deleted between the read above and this lock. A 404 is the honest
            // answer and is what the next request would say anyway.
            return null;
        }

        const outcome = executeRequest(plan, request, row.db as JsonDocument, row.size_bytes);

        if (outcome.document !== null) {
            await tx.graphqlServer.update({
                where: { id: serverId },
                data: {
                    db: outcome.document as Prisma.InputJsonValue,
                    sizeBytes: outcome.bytes,
                },
            });
        }

        return outcome;
    });
}
