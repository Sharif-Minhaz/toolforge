import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { hashCredential } from "../domain/credentials";
import type { WorkspaceSummary } from "../types";

/**
 * Every read and write the studio's identity layer makes. The only file in the
 * module that imports Prisma.
 *
 * Two rules run through all of it. **A secret is only ever a digest here** — no
 * function on this page accepts or returns a raw credential, so nothing
 * downstream can accidentally log one. And **ownership is a join, never a
 * parameter**: a caller asks for a workspace *by the secret it holds*, so there
 * is no signature into which an unowned id can be passed.
 */

type WorkspaceRow = {
    readonly id: string;
    readonly name: string;
    readonly createdAt: Date;
    readonly _count: { readonly servers: number };
};

function toSummary(row: WorkspaceRow): WorkspaceSummary {
    return {
        id: row.id,
        name: row.name,
        // ISO-8601 rather than a `Date`: this crosses a Server Action boundary
        // and the locale on the other side does the formatting.
        createdAt: row.createdAt.toISOString(),
        serverCount: row._count.servers,
    };
}

const SUMMARY_SELECT = {
    id: true,
    name: true,
    createdAt: true,
    _count: { select: { servers: true } },
} as const;

/**
 * The workspaces this browser owns, in the order its cookie lists them.
 *
 * Sorted in memory against the cookie rather than by any column, because the
 * cookie's order is "newest claim first" and that is what the switcher shows.
 * A secret that matches nothing — a workspace deleted from another browser —
 * simply contributes no row, which is what makes a stale cookie harmless.
 */
export async function listWorkspacesBySecrets(
    secrets: readonly string[],
): Promise<readonly WorkspaceSummary[]> {
    if (secrets.length === 0) {
        return [];
    }

    const hashes = await Promise.all(secrets.map(hashCredential));

    const claims = await prisma.workspaceSecret.findMany({
        where: { secretHash: { in: hashes } },
        select: { secretHash: true, workspace: { select: SUMMARY_SELECT } },
    });

    const byHash = new Map(claims.map((claim) => [claim.secretHash, claim.workspace]));

    return hashes
        .map((hash) => byHash.get(hash))
        .filter((workspace) => workspace !== undefined)
        .map(toSummary);
}

/** Resolves one secret to the workspace it claims, or null. */
export async function findWorkspaceBySecret(secret: string): Promise<WorkspaceSummary | null> {
    const claim = await prisma.workspaceSecret.findUnique({
        where: { secretHash: await hashCredential(secret) },
        select: { workspace: { select: SUMMARY_SELECT } },
    });

    return claim ? toSummary(claim.workspace) : null;
}

/**
 * Which of the secrets this browser holds claims a given workspace.
 *
 * The gate every editing action runs first. It answers with the secret rather
 * than a boolean so the caller can go on to use it — to drop exactly that claim
 * on "forget this device", for instance — without a second lookup.
 */
export async function findOwningSecret(
    secrets: readonly string[],
    workspaceId: string,
): Promise<string | null> {
    if (secrets.length === 0) {
        return null;
    }

    const hashes = await Promise.all(secrets.map(hashCredential));
    const claims = await prisma.workspaceSecret.findMany({
        where: { workspaceId, secretHash: { in: hashes } },
        select: { secretHash: true },
    });

    const owning = new Set(claims.map((claim) => claim.secretHash));
    const index = hashes.findIndex((hash) => owning.has(hash));

    return index === -1 ? null : secrets[index];
}

export type CreateWorkspaceRow = {
    readonly name: string;
    readonly secret: string;
    readonly recoveryKey: string;
};

/**
 * Creates the workspace and its first device claim in one transaction, so a
 * failure cannot leave a workspace nobody can reach.
 */
export async function insertWorkspace(input: CreateWorkspaceRow): Promise<WorkspaceSummary | null> {
    const [secretHash, recoveryHash] = await Promise.all([
        hashCredential(input.secret),
        hashCredential(input.recoveryKey),
    ]);

    try {
        const workspace = await prisma.workspace.create({
            data: {
                name: input.name,
                recoveryHash,
                secrets: { create: { secretHash } },
            },
            select: SUMMARY_SELECT,
        });

        return toSummary(workspace);
    } catch (caught) {
        logEvent("error", "mock_server.workspace_create_failed", { error: describeError(caught) });

        return null;
    }
}

/**
 * Attaches a new device claim to whichever workspace answers to a recovery key.
 *
 * The key is looked up by digest, so a wrong key is one indexed miss rather
 * than anything this server has to reason about. Returns null for both "no such
 * key" and "the write failed", because the caller must not be able to tell a
 * guesser which of those happened.
 */
export async function attachSecretByRecoveryHash(
    recoveryHash: string,
    secret: string,
): Promise<WorkspaceSummary | null> {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { recoveryHash },
            select: SUMMARY_SELECT,
        });

        if (workspace === null) {
            return null;
        }

        const secretHash = await hashCredential(secret);

        // `upsert` rather than `create`, so importing a key this browser has
        // already imported is a no-op instead of a unique-constraint failure.
        await prisma.workspaceSecret.upsert({
            where: { secretHash },
            create: { secretHash, workspaceId: workspace.id },
            update: { lastUsedAt: new Date() },
        });

        return toSummary(workspace);
    } catch (caught) {
        logEvent("error", "mock_server.workspace_import_failed", { error: describeError(caught) });

        return null;
    }
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<boolean> {
    try {
        await prisma.workspace.update({ where: { id: workspaceId }, data: { name } });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.workspace_rename_failed", { error: describeError(caught) });

        return false;
    }
}

/**
 * Deletes the workspace and, by cascade, every server, endpoint, variable, log
 * and device claim under it. Irreversible, and the UI says so before calling.
 */
export async function deleteWorkspace(workspaceId: string): Promise<boolean> {
    try {
        await prisma.workspace.delete({ where: { id: workspaceId } });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.workspace_delete_failed", { error: describeError(caught) });

        return false;
    }
}

/**
 * Drops one device's claim, leaving the workspace and every other device
 * untouched. What "forget on this device" calls.
 */
export async function dropSecret(secret: string): Promise<boolean> {
    try {
        await prisma.workspaceSecret.delete({
            where: { secretHash: await hashCredential(secret) },
        });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.secret_drop_failed", { error: describeError(caught) });

        return false;
    }
}

/** Touched when the studio loads, so a dormancy sweep has something to read. */
export async function touchWorkspace(workspaceId: string): Promise<void> {
    try {
        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { lastSeenAt: new Date() },
        });
    } catch (caught) {
        // A missed touch costs a dormancy sweep some accuracy and costs the
        // visitor nothing, so it must never fail the page they asked for.
        logEvent("warn", "mock_server.workspace_touch_failed", { error: describeError(caught) });
    }
}
