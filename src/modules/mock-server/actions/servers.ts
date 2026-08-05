"use server";

import { revalidatePath } from "next/cache";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";

import { parseBodyText } from "../domain/body-text";
import { GRAPH_SCHEMA_VERSION } from "../types/graph";
import { createDefaultGraph, validateGraph } from "../domain/graph";
import { parsePathPattern } from "../domain/path-pattern";
import { checkServerKey, createServerKey, suggestServerKey } from "../domain/server-key";
import { checkWorkspaceName } from "../domain/workspace-name";
import { isMockStorageConfigured } from "../repository/config";
import {
    deleteEndpoint as deleteEndpointRow,
    findEndpoint,
    findEndpointWorkspace,
    insertEndpoint,
    isEndpointLimitReached,
    updateEndpoint as updateEndpointRow,
} from "../repository/endpoints";
import {
    deleteServer as deleteServerRow,
    findServerDetail,
    findServerWorkspace,
    insertServer,
    isServerLimitReached,
    listServers,
    updateServer as updateServerRow,
} from "../repository/servers";
import { readWorkspaceSecrets } from "../repository/session";
import { findOwningSecret } from "../repository/workspaces";
import type {
    CreateServerResult,
    EndpointResult,
    ServerActionResult,
    ServerDetail,
    ServerSummary,
} from "../types";
import type { GraphDocument, GraphNode, HttpMethod } from "../types/graph";
import {
    createEndpointSchema,
    createServerSchema,
    endpointRefSchema,
    serverRefSchema,
    updateEndpointSchema,
    updateServerSchema,
} from "../validation";

/**
 * Servers and endpoints, every one of them behind the same ownership gate.
 *
 * The gate resolves a workspace from the cookie and refuses anything the
 * browser cannot prove it holds. Note the shape of `requireServer` and
 * `requireEndpoint`: they take the id, look up which workspace it belongs to,
 * and check *that* — so there is no signature into which a caller can pass a
 * workspace they own alongside a server they do not.
 */

async function ownsWorkspace(workspaceId: string | null): Promise<boolean> {
    if (workspaceId === null || !isMockStorageConfigured()) {
        return false;
    }

    try {
        return (await findOwningSecret(await readWorkspaceSecrets(), workspaceId)) !== null;
    } catch (caught) {
        logEvent("error", "mock_server.ownership_check_failed", { error: describeError(caught) });

        return false;
    }
}

async function requireServer(serverId: string): Promise<boolean> {
    return ownsWorkspace(await findServerWorkspace(serverId));
}

async function requireEndpoint(endpointId: string): Promise<boolean> {
    return ownsWorkspace(await findEndpointWorkspace(endpointId));
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getServers(workspaceId: string): Promise<readonly ServerSummary[]> {
    if (!(await ownsWorkspace(workspaceId))) {
        return [];
    }

    try {
        return await listServers(workspaceId);
    } catch (caught) {
        logEvent("error", "mock_server.list_servers_failed", { error: describeError(caught) });

        return [];
    }
}

export async function getServerDetail(
    workspaceId: string,
    serverId: string,
): Promise<ServerDetail | null> {
    if (!(await ownsWorkspace(workspaceId))) {
        return null;
    }

    try {
        return await findServerDetail(workspaceId, serverId);
    } catch (caught) {
        logEvent("error", "mock_server.server_detail_failed", { error: describeError(caught) });

        return null;
    }
}

export async function getEndpoint(endpointId: string): Promise<EndpointResult> {
    if (!(await requireEndpoint(endpointId))) {
        return { ok: false, reason: "not_owner" };
    }

    const endpoint = await findEndpoint(endpointId);

    return endpoint ? { ok: true, endpoint } : { ok: false, reason: "not_found" };
}

// ─── Servers ────────────────────────────────────────────────────────────────

export async function createServer(input: unknown): Promise<CreateServerResult> {
    const parsed = createServerSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const name = checkWorkspaceName(parsed.data.name);

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    if (!(await ownsWorkspace(parsed.data.workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    if (await isServerLimitReached(parsed.data.workspaceId)) {
        return { ok: false, reason: "server_limit_reached" };
    }

    // Blank means "draw me one". A suggestion from the name is tried first so
    // the address reads like the thing it serves.
    const requested =
        parsed.data.key.trim() === ""
            ? suggestServerKey(name.name) || createServerKey(cryptoRandomBytes)
            : parsed.data.key;

    const key = checkServerKey(requested);

    if (!key.ok) {
        return { ok: false, reason: key.reason === "reserved" ? "key_reserved" : "invalid_key" };
    }

    const result = await insertServer({
        workspaceId: parsed.data.workspaceId,
        key: key.key,
        name: name.name,
    });

    if (!result.ok) {
        return { ok: false, reason: result.reason };
    }

    revalidatePath(`/mock/${parsed.data.workspaceId}`);

    return { ok: true, server: result.server };
}

export async function updateServer(input: unknown): Promise<ServerActionResult> {
    const parsed = updateServerSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const name = checkWorkspaceName(parsed.data.name);

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    if (!(await requireServer(parsed.data.serverId))) {
        return { ok: false, reason: "not_owner" };
    }

    const written = await updateServerRow(parsed.data.serverId, {
        name: name.name,
        description: parsed.data.description?.trim() || null,
        isPaused: parsed.data.isPaused,
    });

    return written ? { ok: true } : { ok: false, reason: "write_failed" };
}

export async function deleteServer(input: unknown): Promise<ServerActionResult> {
    const parsed = serverRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if (!(await requireServer(parsed.data.serverId))) {
        return { ok: false, reason: "not_owner" };
    }

    return (await deleteServerRow(parsed.data.serverId))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export async function createEndpoint(input: unknown): Promise<EndpointResult> {
    const parsed = createEndpointSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_path" };
    }

    const path = parsePathPattern(parsed.data.path);

    if (!path.ok) {
        return { ok: false, reason: "invalid_path" };
    }

    if (!(await requireServer(parsed.data.serverId))) {
        return { ok: false, reason: "not_owner" };
    }

    if (await isEndpointLimitReached(parsed.data.serverId)) {
        return { ok: false, reason: "endpoint_limit_reached" };
    }

    const result = await insertEndpoint({
        serverId: parsed.data.serverId,
        collectionId: parsed.data.collectionId,
        name: parsed.data.name.trim(),
        method: parsed.data.method,
        parsed: path.parsed,
    });

    return result.ok
        ? { ok: true, endpoint: result.endpoint }
        : { ok: false, reason: result.reason };
}

/**
 * Saves an endpoint's route and its response.
 *
 * The graph is rebuilt from the stored one rather than from scratch, so the
 * node ids and positions an author has arranged survive a save from the M1
 * editor — which is what lets M3's canvas open the same endpoint and find its
 * layout intact.
 */
export async function updateEndpoint(input: unknown): Promise<EndpointResult> {
    const parsed = updateEndpointSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_status" };
    }

    const path = parsePathPattern(parsed.data.path);

    if (!path.ok) {
        return { ok: false, reason: "invalid_path" };
    }

    const body = parseBodyText(parsed.data.bodyText, parsed.data.contentType);

    if (!body.ok) {
        return { ok: false, reason: "invalid_body" };
    }

    if (!(await requireEndpoint(parsed.data.endpointId))) {
        return { ok: false, reason: "not_owner" };
    }

    const existing = await findEndpoint(parsed.data.endpointId);

    if (existing === null) {
        return { ok: false, reason: "not_found" };
    }

    const graph = withResponse({
        status: parsed.data.status,
        contentType: parsed.data.contentType,
        headers: parsed.data.headers,
        body: { kind: "static", value: body.value },
    });

    const checked = validateGraph(graph);

    if (!checked.ok) {
        return { ok: false, reason: "invalid_status" };
    }

    const result = await updateEndpointRow({
        endpointId: parsed.data.endpointId,
        version: parsed.data.version,
        name: parsed.data.name.trim(),
        method: parsed.data.method as HttpMethod,
        parsed: path.parsed,
        isEnabled: parsed.data.isEnabled,
        graph: checked.graph,
    });

    return result.ok
        ? { ok: true, endpoint: result.endpoint }
        : { ok: false, reason: result.reason };
}

export async function deleteEndpoint(input: unknown): Promise<ServerActionResult> {
    const parsed = endpointRefSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if (!(await requireEndpoint(parsed.data.endpointId))) {
        return { ok: false, reason: "not_owner" };
    }

    return (await deleteEndpointRow(parsed.data.endpointId))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}

/**
 * The two-node graph with its response node replaced.
 *
 * M1's editor owns the whole document, because M1's endpoints have exactly two
 * nodes and the editor edits both of the things that vary. When the canvas
 * lands in M3 this becomes a merge over the *stored* document instead — the
 * shape is already a real `GraphDocument`, so no row has to change, only this
 * function.
 */
function withResponse(data: Extract<GraphNode, { kind: "response" }>["data"]): GraphDocument {
    const base = createDefaultGraph();

    return {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes: base.nodes.map((node) => (node.kind === "response" ? { ...node, data } : node)),
        edges: base.edges,
    };
}
