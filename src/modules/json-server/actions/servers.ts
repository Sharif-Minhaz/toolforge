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
import {
    checkServerKey,
    createServerKey,
    suggestServerKey,
} from "@/modules/tools/domain/server-key";
import { readDocument } from "@/modules/tools/domain/json-document";
import { checkServerName } from "@/modules/tools/domain/server-name";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";

import { MAX_SERVERS_PER_BROWSER } from "../domain/constants";
import { SAMPLE_DOCUMENT } from "../domain/samples";
import { isJsonStorageConfigured } from "../repository/config";
import { clearRequestLogs, listRequestLogs } from "../repository/logs";
import { spendCreateQuota } from "../repository/quota";
import { readServerSecrets, writeServerSecrets } from "../repository/session";
import {
    attachSecretByRecoveryHash,
    deleteServer as deleteServerRow,
    dropSecret,
    findOwningSecret,
    insertServer,
    listServersBySecrets,
    readServerDetail,
    renameServer as renameServerRow,
    replaceDocument as replaceDocumentRow,
    resetDocument as resetDocumentRow,
    rotateRecoveryKey as rotateRecoveryKeyRow,
    setPaused as setPausedRow,
} from "../repository/servers";
import type {
    ActionResult,
    CreateResult,
    ImportResult,
    JsonServerDetail,
    ReplaceDocumentResult,
    RequestLogRow,
    RotateRecoveryResult,
    ServerOverview,
} from "../types";
import {
    createServerSchema,
    importServerSchema,
    renameServerSchema,
    replaceDocumentSchema,
    serverRefSchema,
    setPausedSchema,
} from "../validation";

/**
 * Every entry point into server ownership.
 *
 * The gates run cheapest-first, the same ordering the Port Scanner and the Mock
 * Server Studio use, and the order is the design rather than a style preference:
 *
 * 1. **Shape, document and storage** — free and local. A malformed name, an
 *    unparseable `db.json`, or a deployment with no database costs no challenge,
 *    no database write and no round trip. Parsing the document here is what lets
 *    the form say "line 4, unexpected `}`" without spending a Turnstile token.
 * 2. **Capacity** — also free, and refused before the challenge so a visitor
 *    already holding five is not made to solve one for nothing.
 * 3. **Turnstile** — before the quota, or a script drains a stranger's allowance
 *    by replaying their address without solving anything.
 * 4. **Quota** — last, because it is the only gate that limits *volume*.
 *    Everything above refuses one bad request; this refuses the eleventh good
 *    one. It fails closed: see `spendCreateQuota`.
 */

async function callerAddress(): Promise<string> {
    const inbound = await headers();

    // An absent address is not a reason to skip the limit. Everything behind one
    // unreadable proxy shares a bucket, which is a worse experience for them and
    // no gap at all — the alternative is an unmetered path reachable by
    // stripping a header.
    return resolveRemoteIp(inbound) ?? "unknown";
}

/** What the landing page renders. Read-only, so no challenge and no quota. */
export async function getServerOverview(): Promise<ServerOverview> {
    const isStorageConfigured = isJsonStorageConfigured();

    if (!isStorageConfigured) {
        return {
            servers: [],
            canCreate: false,
            maxServers: MAX_SERVERS_PER_BROWSER,
            isStorageConfigured: false,
        };
    }

    const secrets = await readServerSecrets();

    try {
        return {
            servers: await listServersBySecrets(secrets),
            // Read from the cookie, not from the rows: a secret whose server was
            // deleted elsewhere still occupies a slot until it is forgotten, and
            // telling the visitor they have room when they do not would put the
            // refusal after the challenge instead of before it.
            canCreate: hasCapacity(secrets, MAX_SERVERS_PER_BROWSER),
            maxServers: MAX_SERVERS_PER_BROWSER,
            isStorageConfigured: true,
        };
    } catch (caught) {
        logEvent("error", "json_server.overview_failed", { error: describeError(caught) });

        return {
            servers: [],
            canCreate: false,
            maxServers: MAX_SERVERS_PER_BROWSER,
            isStorageConfigured: true,
        };
    }
}

export async function createServer(input: unknown): Promise<CreateResult> {
    const parsed = createServerSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const name = checkServerName(parsed.data.name);

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    // Parsed before anything is spent, so a stray comma costs a message and not
    // a challenge. The failure is returned whole — it carries the line and
    // column the reader needs.
    const text = parsed.data.document.trim().length === 0 ? SAMPLE_DOCUMENT : parsed.data.document;
    const document = readDocument(text);

    if (!document.ok) {
        return document;
    }

    if (!isJsonStorageConfigured()) {
        return { ok: false, reason: "storage_unavailable" };
    }

    const secrets = await readServerSecrets();

    if (!hasCapacity(secrets, MAX_SERVERS_PER_BROWSER)) {
        return { ok: false, reason: "cookie_full" };
    }

    // A blank key means "draw one for me": try the name first, because
    // `/j/payments-api` is worth more to its owner than `/j/k3xq7m2p`.
    const wanted =
        parsed.data.key.trim().length > 0 ? parsed.data.key : suggestServerKey(name.name);
    const checked = checkServerKey(wanted);

    if (parsed.data.key.trim().length > 0 && !checked.ok) {
        return { ok: false, reason: "invalid_key" };
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
    const chosen = checked.ok ? checked.key : createServerKey(cryptoRandomBytes);
    const server = await insertServer({
        key: chosen,
        name: name.name,
        secret,
        recoveryKey,
        document: document.document,
        bytes: document.bytes,
    });

    if (server === null) {
        // The unique index on `key` is what lands here. A key the visitor typed
        // is their choice to change; one this drew is retried once with a fresh
        // draw, because telling somebody their randomly generated key collided
        // is a sentence with no action in it.
        if (checked.ok && parsed.data.key.trim().length > 0) {
            return { ok: false, reason: "key_taken" };
        }

        const retried = await insertServer({
            key: createServerKey(cryptoRandomBytes),
            name: name.name,
            secret,
            recoveryKey,
            document: document.document,
            bytes: document.bytes,
        });

        if (retried === null) {
            return { ok: false, reason: "write_failed" };
        }

        return finishCreate(secrets, secret, recoveryKey, retried);
    }

    return finishCreate(secrets, secret, recoveryKey, server);
}

async function finishCreate(
    secrets: readonly string[],
    secret: string,
    recoveryKey: string,
    server: Awaited<ReturnType<typeof insertServer>> & object,
): Promise<CreateResult> {
    const next = addSecret(secrets, secret, MAX_SERVERS_PER_BROWSER);

    if (!next.ok) {
        return { ok: false, reason: next.reason };
    }

    await writeServerSecrets(next.secrets);

    return {
        ok: true,
        server,
        // The one moment this value exists in a readable form. It is never
        // stored unhashed and can never be shown again.
        recoveryKey: formatRecoveryKey(recoveryKey),
    };
}

/** The revive path: a printable key, typed into a browser that owns nothing. */
export async function importServer(input: unknown): Promise<ImportResult> {
    const parsed = importServerSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_recovery_key" };
    }

    // Rejected on shape before anything is queried, so a scripted walk of the
    // keyspace never reaches the database at all.
    const canonical = normalizeRecoveryKey(parsed.data.recoveryKey);

    if (canonical === null) {
        return { ok: false, reason: "invalid_recovery_key" };
    }

    if (!isJsonStorageConfigured()) {
        return { ok: false, reason: "storage_unavailable" };
    }

    const secrets = await readServerSecrets();

    if (!hasCapacity(secrets, MAX_SERVERS_PER_BROWSER)) {
        return { ok: false, reason: "cookie_full" };
    }

    const address = await callerAddress();
    const challenge = await verifyTurnstileToken(parsed.data.token, address);

    if (!challenge.ok) {
        return { ok: false, reason: "challenge_failed" };
    }

    // Importing spends the same allowance as creating. Guessing keys is the one
    // thing this endpoint can be abused for, and an unmetered guess is the only
    // thing that makes 80 bits worth attacking.
    const quota = await spendCreateQuota(address);

    if (!quota.ok) {
        return { ok: false, reason: "quota_exhausted" };
    }

    const secret = createBrowserSecret(cryptoRandomBytes);
    const server = await attachSecretByRecoveryHash(await hashCredential(canonical), secret);

    if (server === null) {
        return { ok: false, reason: "unknown_recovery_key" };
    }

    const next = addSecret(secrets, secret, MAX_SERVERS_PER_BROWSER);

    if (!next.ok) {
        return { ok: false, reason: next.reason };
    }

    await writeServerSecrets(next.secrets);

    return { ok: true, server };
}

export async function getServerDetail(input: unknown): Promise<JsonServerDetail | null> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success || (await requireOwnership(parsed.data.serverId)) === null) {
        return null;
    }

    return readServerDetail(parsed.data.serverId);
}

export async function getRequestLogs(input: unknown): Promise<readonly RequestLogRow[]> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success || (await requireOwnership(parsed.data.serverId)) === null) {
        return [];
    }

    return listRequestLogs(parsed.data.serverId);
}

export async function clearLogs(input: unknown): Promise<ActionResult> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if ((await requireOwnership(parsed.data.serverId)) === null) {
        return { ok: false, reason: "not_owner" };
    }

    await clearRequestLogs(parsed.data.serverId);

    return { ok: true };
}

export async function renameServer(input: unknown): Promise<ActionResult> {
    const parsed = renameServerSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const name = checkServerName(parsed.data.name);

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    if ((await requireOwnership(parsed.data.serverId)) === null) {
        return { ok: false, reason: "not_owner" };
    }

    return (await renameServerRow(parsed.data.serverId, name.name))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}

export async function setServerPaused(input: unknown): Promise<ActionResult> {
    const parsed = setPausedSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if ((await requireOwnership(parsed.data.serverId)) === null) {
        return { ok: false, reason: "not_owner" };
    }

    return (await setPausedRow(parsed.data.serverId, parsed.data.isPaused))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}

/**
 * Replaces the whole document from the studio's editor.
 *
 * Parsed here, before ownership is even checked, so a syntax error costs one
 * round trip and comes back with a line number. The document is then re-checked
 * in `replaceDocument` — belt and braces, because that is the one write that
 * does not pass through the serving engine.
 */
export async function replaceDocument(input: unknown): Promise<ReplaceDocumentResult> {
    const parsed = replaceDocumentSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    const document = readDocument(parsed.data.document);

    if (!document.ok) {
        return document;
    }

    if ((await requireOwnership(parsed.data.serverId)) === null) {
        return { ok: false, reason: "not_owner" };
    }

    const detail = await replaceDocumentRow(parsed.data.serverId, document.document);

    return detail === null ? { ok: false, reason: "write_failed" } : { ok: true, detail };
}

/** Puts the document back to what the server was created with. */
export async function resetDocument(input: unknown): Promise<ReplaceDocumentResult> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if ((await requireOwnership(parsed.data.serverId)) === null) {
        return { ok: false, reason: "not_owner" };
    }

    const detail = await resetDocumentRow(parsed.data.serverId);

    return detail === null ? { ok: false, reason: "write_failed" } : { ok: true, detail };
}

/**
 * Draws a new recovery key and invalidates the old one.
 *
 * Returns it in readable form exactly once, like creation does. Anyone who
 * wrote the previous one down loses access through it — which is the point, and
 * which the confirmation says before it happens.
 */
export async function rotateRecoveryKey(input: unknown): Promise<RotateRecoveryResult> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if ((await requireOwnership(parsed.data.serverId)) === null) {
        return { ok: false, reason: "not_owner" };
    }

    const recoveryKey = createRecoveryKey(cryptoRandomBytes);

    return (await rotateRecoveryKeyRow(parsed.data.serverId, recoveryKey))
        ? { ok: true, recoveryKey: formatRecoveryKey(recoveryKey) }
        : { ok: false, reason: "write_failed" };
}

/**
 * Deletes the server itself — its document, its logs, and every other browser's
 * claim on it. `forgetServer` is the one that only affects here.
 */
export async function deleteServer(input: unknown): Promise<ActionResult> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    const owning = await requireOwnership(parsed.data.serverId);

    if (owning === null) {
        return { ok: false, reason: "not_owner" };
    }

    if (!(await deleteServerRow(parsed.data.serverId))) {
        return { ok: false, reason: "write_failed" };
    }

    // The row is gone, so the cookie entry now names nothing. Dropping it keeps
    // the list honest rather than relying on the read to filter it out.
    const secrets = await readServerSecrets();
    await writeServerSecrets(removeSecret(secrets, owning));

    return { ok: true };
}

/**
 * Drops this browser's claim and nothing else. The server keeps answering, every
 * other browser keeps its access, and the recovery key still works — so this is
 * safe to offer next to a delete that is not.
 */
export async function forgetServer(input: unknown): Promise<ActionResult> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    const owning = await requireOwnership(parsed.data.serverId);

    if (owning === null) {
        return { ok: false, reason: "not_owner" };
    }

    await dropSecret(owning);

    const secrets = await readServerSecrets();
    await writeServerSecrets(removeSecret(secrets, owning));

    return { ok: true };
}

/**
 * The gate. Returns the secret this browser holds for the server, or null.
 *
 * Every action above runs it, and none of them takes an id without running it
 * first — which is the whole reason ownership is resolved from the cookie rather
 * than passed in.
 */
async function requireOwnership(serverId: string): Promise<string | null> {
    if (!isJsonStorageConfigured()) {
        return null;
    }

    try {
        return await findOwningSecret(await readServerSecrets(), serverId);
    } catch (caught) {
        logEvent("error", "json_server.ownership_check_failed", { error: describeError(caught) });

        return null;
    }
}
