"use server";

import { revalidatePath } from "next/cache";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";

import { GRAPH_SCHEMA_VERSION } from "../types/graph";
import { createDefaultGraph, readGraph, validateGraph } from "../domain/graph";
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
    ServerFailureReason,
    ServerSummary,
} from "../types";
import type { PathPatternProblem } from "../types/routing";
import type { GraphDocument, GraphNode, HttpMethod, ValueExpr } from "../types/graph";
import {
    createEndpointSchema,
    createServerSchema,
    endpointRefSchema,
    pauseServerSchema,
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

/**
 * Two path problems get their own message; everything else shares one.
 *
 * The split is not tidiness. "That is not a usable path" tells somebody who
 * typed `/game?id=:game_id` nothing they can act on, and it is the single most
 * likely thing to type — a query string looks like part of an address because
 * in a browser's URL bar it is one.
 */
function pathFailure(reason: PathPatternProblem): ServerFailureReason {
    if (reason === "query_in_path") {
        return "path_has_query";
    }

    return reason === "fragment_in_path" ? "path_has_fragment" : "invalid_path";
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

/**
 * Switches a server off, or back on.
 *
 * A paused server answers **503 `server_paused`** on every route rather than
 * 404, and that distinction is the whole point: 404 says "this address is
 * wrong", which sends whoever is calling to check their URL. 503 says "this
 * exists and is not answering right now", which is true and is what a caller
 * needs in order to stop debugging their own code. `serveMockRequest` has
 * refused a paused server since M1; until now nothing could set the flag.
 *
 * The endpoints are untouched — pausing is not deleting, and coming back is one
 * press. `revalidatePath` covers both the workspace list and the server page,
 * because the state is shown on both and a stale "running" badge over a server
 * that is off is worse than no badge at all.
 */
export async function pauseServer(input: unknown): Promise<ServerActionResult> {
    const parsed = pauseServerSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    const workspaceId = await findServerWorkspace(parsed.data.serverId);

    if (!(await ownsWorkspace(workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    const written = await updateServerRow(parsed.data.serverId, {
        isPaused: parsed.data.isPaused,
    });

    if (!written) {
        return { ok: false, reason: "write_failed" };
    }

    revalidatePath(`/mock/${workspaceId}`);
    revalidatePath(`/mock/${workspaceId}/servers/${parsed.data.serverId}`);

    return { ok: true };
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
        return { ok: false, reason: pathFailure(path.reason) };
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
        return { ok: false, reason: pathFailure(path.reason) };
    }

    if (!(await requireEndpoint(parsed.data.endpointId))) {
        return { ok: false, reason: "not_owner" };
    }

    const existing = await findEndpoint(parsed.data.endpointId);

    if (existing === null) {
        return { ok: false, reason: "not_found" };
    }

    const graph = withResponse(parsed.data.graph, {
        status: parsed.data.status,
        contentType: parsed.data.contentType,
        headers: parsed.data.headers,
        // Passed through as-is; `validateGraph` below is the only authority on
        // whether it is a value tree this build can resolve.
        body: parsed.data.body as ValueExpr,
    });

    const checked = validateGraph(graph);

    if (!checked.ok) {
        // The reason is narrowed so the reader is told which of the two things
        // is wrong — a bad status code and an unresolvable value read nothing
        // alike, and one generic "invalid" for both is what makes a form
        // frustrating.
        const problem = checked.problems[0]?.reason;

        return {
            ok: false,
            reason:
                problem === "invalid_status"
                    ? "invalid_status"
                    : problem === "unsupported_content_type"
                      ? "invalid_content_type"
                      : "invalid_body",
        };
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
 * The submitted graph with the response form's fields merged into it.
 *
 * Two editors, one document. The canvas owns the nodes and edges; the form
 * above it owns status, content type, headers and the body tree. Merging here
 * rather than having each save separately is what stops a graph and its
 * response drifting apart — the failure the M1 note predicted and this is the
 * milestone that had to answer.
 *
 * Only the *first* response node takes the form's settings. A graph with
 * several is legitimate — one per branch — and the form edits the one the
 * inspector is showing, which is the first until the canvas passes an id.
 */
function withResponse(
    submitted: unknown,
    data: Extract<GraphNode, { kind: "response" }>["data"],
): GraphDocument {
    const read = readGraph(submitted);
    const base = read.ok && read.graph.nodes.length > 0 ? read.graph : createDefaultGraph();
    let merged = false;

    return {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes: base.nodes.map((node) => {
            if (node.kind !== "response" || merged) {
                return node;
            }

            merged = true;

            return { ...node, data };
        }),
        edges: base.edges,
    };
}
