import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { hashCredential } from "@/modules/tools/domain/browser-secret";
import { describeUsage } from "@/modules/tools/domain/document-usage";
import {
    checkDocument,
    documentBytes,
    summarize,
    writeDocument,
} from "@/modules/tools/domain/json-document";
import type { JsonDocument, ResourceSummary } from "@/modules/tools/types/json-document";

import { deriveRoutes } from "../domain/routes";
import type { JsonServerDetail, JsonServerSummary } from "../types";

/**
 * Every read and write the studio's identity layer makes. One of only two files
 * in this module that import Prisma.
 *
 * Two rules run through all of it, both inherited from the Mock Server Studio's
 * equivalent because both were right there. **A secret is only ever a digest
 * here** — no function on this page accepts or returns a raw credential, so
 * nothing downstream can accidentally log one. And **ownership is a join, never
 * a parameter**: a caller asks for a server *by the secret it holds*, so there
 * is no signature into which an unowned id can be passed.
 */

const SUMMARY_SELECT = {
    id: true,
    key: true,
    name: true,
    isPaused: true,
    sizeBytes: true,
    createdAt: true,
    updatedAt: true,
} as const;

type SummaryRow = {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly isPaused: boolean;
    readonly sizeBytes: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
};

/**
 * A summary needs the resource and record counts, and those live inside the
 * JSONB. Reading the whole document to count them is what the list page would
 * otherwise do for five servers at once, so the counts are derived from a
 * document the caller already has — or reported as zero when it does not.
 */
function toSummary(row: SummaryRow, resources: readonly ResourceSummary[]): JsonServerSummary {
    return {
        id: row.id,
        key: row.key,
        name: row.name,
        isPaused: row.isPaused,
        usage: describeUsage(row.sizeBytes),
        resourceCount: resources.length,
        recordCount: resources.reduce((total, resource) => total + resource.count, 0),
        // ISO-8601 rather than a `Date`: this crosses a Server Action boundary
        // and the locale on the other side does the formatting.
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/**
 * The servers this browser owns, in the order its cookie lists them.
 *
 * Sorted in memory against the cookie rather than by any column, because the
 * cookie's order is "newest claim first" and that is what the list shows. A
 * secret that matches nothing — a server deleted from another browser — simply
 * contributes no row, which is what makes a stale cookie harmless.
 */
export async function listServersBySecrets(
    secrets: readonly string[],
): Promise<readonly JsonServerSummary[]> {
    if (secrets.length === 0) {
        return [];
    }

    const hashes = await Promise.all(secrets.map(hashCredential));
    const rows = await prisma.jsonServerSecret.findMany({
        where: { secretHash: { in: hashes } },
        select: { secretHash: true, server: { select: { ...SUMMARY_SELECT, db: true } } },
    });

    const byHash = new Map(rows.map((row) => [row.secretHash, row.server]));

    return hashes
        .map((hash) => byHash.get(hash))
        .filter((server) => server !== undefined)
        .map((server) => toSummary(server, summarize(server.db as JsonDocument)));
}

/** The secret this browser holds for a server, or null. The ownership gate. */
export async function findOwningSecret(
    secrets: readonly string[],
    serverId: string,
): Promise<string | null> {
    if (secrets.length === 0) {
        return null;
    }

    const hashes = await Promise.all(secrets.map(hashCredential));
    const row = await prisma.jsonServerSecret.findFirst({
        where: { serverId, secretHash: { in: hashes } },
        select: { secretHash: true },
    });

    if (row === null) {
        return null;
    }

    const index = hashes.indexOf(row.secretHash);

    return index < 0 ? null : secrets[index];
}

export async function readServerDetail(serverId: string): Promise<JsonServerDetail | null> {
    try {
        const row = await prisma.jsonServer.findUnique({
            where: { id: serverId },
            select: { ...SUMMARY_SELECT, db: true },
        });

        if (row === null) {
            return null;
        }

        // Touched on load. The only thing a dormancy sweep needs, and far
        // cheaper than deriving it from the newest log row.
        await prisma.jsonServer
            .update({ where: { id: serverId }, data: { lastSeenAt: new Date() } })
            .catch(() => undefined);

        return toDetail(row, row.db as JsonDocument);
    } catch (caught) {
        logEvent("error", "json_server.detail_read_failed", { error: describeError(caught) });

        return null;
    }
}

function toDetail(row: SummaryRow, document: JsonDocument): JsonServerDetail {
    const resources = summarize(document);

    return {
        ...toSummary(row, resources),
        document: writeDocument(document),
        resources,
        routes: deriveRoutes(document),
    };
}

export type InsertServer = {
    readonly key: string;
    readonly name: string;
    readonly secret: string;
    readonly recoveryKey: string;
    readonly document: JsonDocument;
    readonly bytes: number;
};

/**
 * Creates the server and this browser's claim on it in one transaction.
 *
 * Both or neither: a server nobody can reach is worse than no server, and it
 * would occupy its key forever.
 */
export async function insertServer(input: InsertServer): Promise<JsonServerSummary | null> {
    try {
        const [secretHash, recoveryHash] = await Promise.all([
            hashCredential(input.secret),
            hashCredential(input.recoveryKey),
        ]);

        const row = await prisma.$transaction(async (tx) => {
            const server = await tx.jsonServer.create({
                data: {
                    key: input.key,
                    name: input.name,
                    recoveryHash,
                    db: input.document as Prisma.InputJsonValue,
                    // The seed is the document as created, so "reset" is a real
                    // button rather than an instruction to paste the file again.
                    seedDb: input.document as Prisma.InputJsonValue,
                    sizeBytes: input.bytes,
                },
                select: SUMMARY_SELECT,
            });

            await tx.jsonServerSecret.create({ data: { secretHash, serverId: server.id } });

            return server;
        });

        return toSummary(row, summarize(input.document));
    } catch (caught) {
        // A duplicate key lands here. The caller retries with another one rather
        // than this file deciding what the next one should be.
        logEvent("warn", "json_server.insert_failed", { error: describeError(caught) });

        return null;
    }
}

/**
 * Attaches a new claim by recovery key — the revive path.
 *
 * Adds rather than replaces, so importing into a second browser leaves the first
 * one owning it too. A recovery key whose use logs you out elsewhere is not a
 * recovery key.
 */
export async function attachSecretByRecoveryHash(
    recoveryHash: string,
    secret: string,
): Promise<JsonServerSummary | null> {
    try {
        const server = await prisma.jsonServer.findUnique({
            where: { recoveryHash },
            select: { ...SUMMARY_SELECT, db: true },
        });

        if (server === null) {
            return null;
        }

        const secretHash = await hashCredential(secret);

        await prisma.jsonServerSecret.upsert({
            where: { secretHash },
            create: { secretHash, serverId: server.id },
            update: { lastUsedAt: new Date() },
        });

        return toSummary(server, summarize(server.db as JsonDocument));
    } catch (caught) {
        logEvent("error", "json_server.attach_failed", { error: describeError(caught) });

        return null;
    }
}

export async function renameServer(serverId: string, name: string): Promise<boolean> {
    return write(() => prisma.jsonServer.update({ where: { id: serverId }, data: { name } }));
}

export async function setPaused(serverId: string, isPaused: boolean): Promise<boolean> {
    return write(() => prisma.jsonServer.update({ where: { id: serverId }, data: { isPaused } }));
}

export async function deleteServer(serverId: string): Promise<boolean> {
    return write(() => prisma.jsonServer.delete({ where: { id: serverId } }));
}

/** Drops this browser's claim and nothing else. The server keeps running. */
export async function dropSecret(secret: string): Promise<void> {
    try {
        await prisma.jsonServerSecret.delete({
            where: { secretHash: await hashCredential(secret) },
        });
    } catch (caught) {
        logEvent("warn", "json_server.drop_secret_failed", { error: describeError(caught) });
    }
}

/**
 * Replaces the whole document from the studio's editor.
 *
 * Re-validated here rather than trusted from the action, because this is the one
 * write that does not go through the serving engine and a document that fails
 * `checkDocument` would be one every subsequent request has to cope with.
 */
export async function replaceDocument(
    serverId: string,
    document: JsonDocument,
): Promise<JsonServerDetail | null> {
    const checked = checkDocument(document);

    if (!checked.ok) {
        return null;
    }

    try {
        const row = await prisma.jsonServer.update({
            where: { id: serverId },
            data: {
                db: checked.document as Prisma.InputJsonValue,
                sizeBytes: checked.bytes,
            },
            select: { ...SUMMARY_SELECT, db: true },
        });

        return toDetail(row, row.db as JsonDocument);
    } catch (caught) {
        logEvent("error", "json_server.replace_failed", { error: describeError(caught) });

        return null;
    }
}

/** Puts the document back to what it was created with. */
export async function resetDocument(serverId: string): Promise<JsonServerDetail | null> {
    try {
        const seed = await prisma.jsonServer.findUnique({
            where: { id: serverId },
            select: { seedDb: true },
        });

        if (seed === null) {
            return null;
        }

        const document = seed.seedDb as JsonDocument;
        const row = await prisma.jsonServer.update({
            where: { id: serverId },
            data: {
                db: document as Prisma.InputJsonValue,
                sizeBytes: documentBytes(document),
            },
            select: { ...SUMMARY_SELECT, db: true },
        });

        return toDetail(row, row.db as JsonDocument);
    } catch (caught) {
        logEvent("error", "json_server.reset_failed", { error: describeError(caught) });

        return null;
    }
}

/**
 * Rotates the recovery key, invalidating the one written down before.
 *
 * `recoveryEpoch` is bumped alongside the digest so a key from two rotations
 * ago cannot be replayed even if its digest were somehow recovered.
 */
export async function rotateRecoveryKey(serverId: string, recoveryKey: string): Promise<boolean> {
    const recoveryHash = await hashCredential(recoveryKey);

    return write(() =>
        prisma.jsonServer.update({
            where: { id: serverId },
            data: { recoveryHash, recoveryEpoch: { increment: 1 } },
        }),
    );
}

async function write(run: () => Promise<unknown>): Promise<boolean> {
    try {
        await run();

        return true;
    } catch (caught) {
        logEvent("error", "json_server.write_failed", { error: describeError(caught) });

        return false;
    }
}
