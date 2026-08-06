"use server";

import { headers } from "next/headers";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { createBrowserSecret, hashCredential } from "@/modules/tools/domain/browser-secret";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import {
    createRecoveryKey,
    formatRecoveryKey,
    normalizeRecoveryKey,
} from "@/modules/tools/domain/recovery-key";
import { addSecret, hasCapacity, removeSecret } from "@/modules/tools/domain/secret-cookie";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";

import { MAX_WORKSPACES_PER_BROWSER } from "../domain/constants";
import { checkWorkspaceName } from "../domain/workspace-name";
import { isMockStorageConfigured } from "../repository/config";
import { spendCreateQuota } from "../repository/quota";
import { readWorkspaceSecrets, writeWorkspaceSecrets } from "../repository/session";
import {
    attachSecretByRecoveryHash,
    deleteWorkspace as deleteWorkspaceRow,
    dropSecret,
    findOwningSecret,
    insertWorkspace,
    listWorkspacesBySecrets,
    renameWorkspace as renameWorkspaceRow,
} from "../repository/workspaces";
import type {
    WorkspaceActionResult,
    WorkspaceCreateResult,
    WorkspaceImportResult,
    WorkspaceOverview,
} from "../types";
import {
    createWorkspaceSchema,
    importWorkspaceSchema,
    renameWorkspaceSchema,
    workspaceRefSchema,
} from "../validation";

/**
 * Every entry point into workspace ownership.
 *
 * The gates run cheapest-first, the same ordering the Port Scanner uses, and
 * the order is the design rather than a style preference:
 *
 * 1. **Shape and storage** — free and local. A malformed name or a deployment
 *    with no database costs no challenge, no database write and no round trip.
 * 2. **Capacity** — also free, and refused before the challenge so a visitor
 *    already holding three is not made to solve one for nothing.
 * 3. **Turnstile** — before the quota, or a script drains a stranger's
 *    allowance by replaying their address without solving anything.
 * 4. **Quota** — last, because it is the only gate that limits *volume*.
 *    Everything above refuses one bad request; this refuses the thousandth
 *    good one. It fails closed: see `spendCreateQuota`.
 */

async function callerAddress(): Promise<string> {
    const inbound = await headers();

    // An absent address is not a reason to skip the limit. Everything behind
    // one unreadable proxy shares a bucket, which is a worse experience for
    // them and no gap at all — the alternative is an unmetered path reachable
    // by stripping a header.
    return resolveRemoteIp(inbound) ?? "unknown";
}

/** What the landing page renders. Read-only, so no challenge and no quota. */
export async function getWorkspaceOverview(): Promise<WorkspaceOverview> {
    const isStorageConfigured = isMockStorageConfigured();

    if (!isStorageConfigured) {
        return {
            workspaces: [],
            canCreate: false,
            maxWorkspaces: MAX_WORKSPACES_PER_BROWSER,
            isStorageConfigured: false,
        };
    }

    const secrets = await readWorkspaceSecrets();

    try {
        const workspaces = await listWorkspacesBySecrets(secrets);

        return {
            workspaces,
            // Read from the cookie, not from the rows: a secret whose workspace
            // was deleted elsewhere still occupies a slot until it is forgotten,
            // and telling the visitor they have room when they do not would put
            // the refusal after the challenge instead of before it.
            canCreate: hasCapacity(secrets, MAX_WORKSPACES_PER_BROWSER),
            maxWorkspaces: MAX_WORKSPACES_PER_BROWSER,
            isStorageConfigured: true,
        };
    } catch (caught) {
        logEvent("error", "mock_server.overview_failed", { error: describeError(caught) });

        return {
            workspaces: [],
            canCreate: false,
            maxWorkspaces: MAX_WORKSPACES_PER_BROWSER,
            isStorageConfigured: true,
        };
    }
}

export async function createWorkspace(input: unknown): Promise<WorkspaceCreateResult> {
    const parsed = createWorkspaceSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const name = checkWorkspaceName(parsed.data.name);

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    if (!isMockStorageConfigured()) {
        return { ok: false, reason: "storage_unavailable" };
    }

    const secrets = await readWorkspaceSecrets();

    if (!hasCapacity(secrets, MAX_WORKSPACES_PER_BROWSER)) {
        return { ok: false, reason: "cookie_full" };
    }

    const address = await callerAddress();
    const challenge = await verifyTurnstileToken(parsed.data.token, address);

    if (!challenge.ok) {
        return { ok: false, reason: "challenge_failed" };
    }

    const quota = await spendCreateQuota(address);

    if (!quota.ok) {
        return { ok: false, reason: "quota_exhausted" };
    }

    const secret = createBrowserSecret(cryptoRandomBytes);
    const recoveryKey = createRecoveryKey(cryptoRandomBytes);
    const workspace = await insertWorkspace({ name: name.name, secret, recoveryKey });

    if (workspace === null) {
        return { ok: false, reason: "write_failed" };
    }

    const next = addSecret(secrets, secret, MAX_WORKSPACES_PER_BROWSER);

    if (!next.ok) {
        return { ok: false, reason: next.reason };
    }

    await writeWorkspaceSecrets(next.secrets);

    return {
        ok: true,
        workspace,
        // The one moment this value exists in a readable form. It is never
        // stored unhashed and can never be shown again.
        recoveryKey: formatRecoveryKey(recoveryKey),
    };
}

export async function importWorkspace(input: unknown): Promise<WorkspaceImportResult> {
    const parsed = importWorkspaceSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_recovery_key" };
    }

    // Rejected on shape before anything is queried, so a scripted walk of the
    // keyspace never reaches the database at all.
    const canonical = normalizeRecoveryKey(parsed.data.recoveryKey);

    if (canonical === null) {
        return { ok: false, reason: "invalid_recovery_key" };
    }

    if (!isMockStorageConfigured()) {
        return { ok: false, reason: "storage_unavailable" };
    }

    const secrets = await readWorkspaceSecrets();

    if (!hasCapacity(secrets, MAX_WORKSPACES_PER_BROWSER)) {
        return { ok: false, reason: "cookie_full" };
    }

    const address = await callerAddress();
    const challenge = await verifyTurnstileToken(parsed.data.token, address);

    if (!challenge.ok) {
        return { ok: false, reason: "challenge_failed" };
    }

    // Importing spends the same allowance as creating. Guessing keys is the
    // one thing this endpoint can be abused for, and an unmetered guess is the
    // only thing that makes 80 bits worth attacking.
    const quota = await spendCreateQuota(address);

    if (!quota.ok) {
        return { ok: false, reason: "quota_exhausted" };
    }

    const secret = createBrowserSecret(cryptoRandomBytes);
    const workspace = await attachSecretByRecoveryHash(await hashCredential(canonical), secret);

    if (workspace === null) {
        return { ok: false, reason: "unknown_recovery_key" };
    }

    const next = addSecret(secrets, secret, MAX_WORKSPACES_PER_BROWSER);

    if (!next.ok) {
        return { ok: false, reason: next.reason };
    }

    await writeWorkspaceSecrets(next.secrets);

    return { ok: true, workspace };
}

export async function renameWorkspace(input: unknown): Promise<WorkspaceActionResult> {
    const parsed = renameWorkspaceSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const name = checkWorkspaceName(parsed.data.name);

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    const owning = await requireOwnership(parsed.data.workspaceId);

    if (owning === null) {
        return { ok: false, reason: "not_owner" };
    }

    return (await renameWorkspaceRow(parsed.data.workspaceId, name.name))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}

/**
 * Deletes the workspace itself — servers, endpoints, logs and every other
 * browser's claim on it. `forgetWorkspace` is the one that only affects here.
 */
export async function deleteWorkspace(input: unknown): Promise<WorkspaceActionResult> {
    const parsed = workspaceRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    const owning = await requireOwnership(parsed.data.workspaceId);

    if (owning === null) {
        return { ok: false, reason: "not_owner" };
    }

    if (!(await deleteWorkspaceRow(parsed.data.workspaceId))) {
        return { ok: false, reason: "write_failed" };
    }

    // The row is gone, so the cookie entry now names nothing. Dropping it keeps
    // the switcher honest rather than relying on the read to filter it out.
    const secrets = await readWorkspaceSecrets();
    await writeWorkspaceSecrets(removeSecret(secrets, owning));

    return { ok: true };
}

/**
 * Drops this browser's claim and nothing else. The workspace keeps running,
 * every other browser keeps its access, and the recovery key still works — so
 * this is safe to offer next to a delete that is not.
 */
export async function forgetWorkspace(input: unknown): Promise<WorkspaceActionResult> {
    const parsed = workspaceRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    const owning = await requireOwnership(parsed.data.workspaceId);

    if (owning === null) {
        return { ok: false, reason: "not_owner" };
    }

    await dropSecret(owning);

    const secrets = await readWorkspaceSecrets();
    await writeWorkspaceSecrets(removeSecret(secrets, owning));

    return { ok: true };
}

/**
 * The gate. Returns the secret this browser holds for the workspace, or null.
 *
 * Every mutating action above runs it, and none of them takes an id without
 * running it first — which is the whole reason ownership is resolved from the
 * cookie rather than passed in.
 */
async function requireOwnership(workspaceId: string): Promise<string | null> {
    if (!isMockStorageConfigured()) {
        return null;
    }

    try {
        return await findOwningSecret(await readWorkspaceSecrets(), workspaceId);
    } catch (caught) {
        logEvent("error", "mock_server.ownership_check_failed", { error: describeError(caught) });

        return null;
    }
}
