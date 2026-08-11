"use server";

import { z } from "zod";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";

import { MAX_ENDPOINTS_PER_SERVER } from "../domain/constants";
import { readOpenApi, writeOpenApi, type ExportEndpoint } from "../domain/openapi";
import { parsePathPattern } from "../domain/path-pattern";
import { createServerKey, suggestServerKey } from "@/modules/tools/domain/server-key";
import { toJson } from "../domain/value-edit";
import { checkWorkspaceName } from "../domain/workspace-name";
import { isMockStorageConfigured } from "../repository/config";
import { insertEndpoint } from "../repository/endpoints";
import { MAX_DOCUMENT_BYTES, parseOpenApiText } from "../repository/openapi";
import { findServerDetail, insertServer, isServerLimitReached } from "../repository/servers";
import { readWorkspaceSecrets } from "../repository/session";
import { findEndpoint } from "../repository/endpoints";
import { findOwningSecret } from "../repository/workspaces";
import type { JsonValue } from "../types/graph";
import { workspaceIdSchema } from "../validation";

/**
 * Importing an OpenAPI document, and exporting one back.
 *
 * The import is chunked in the sense that matters: endpoints are inserted one
 * at a time and a failure on any single one is recorded rather than rolling the
 * batch back. A four-hundred-operation document with three odd paths should
 * produce three hundred and ninety-seven working endpoints and a list of what
 * it could not take — not an error and nothing to show for it.
 */

const importSchema = z.object({
    workspaceId: workspaceIdSchema,
    name: z.string().max(200),
    text: z.string().max(MAX_DOCUMENT_BYTES),
    /**
     * Whether required headers, query keys and body fields become a guard node.
     * Absent means yes — an older client, and the honest reading of a document
     * that marks a field required.
     */
    enforceRequired: z.boolean().optional(),
});

async function ownsWorkspace(workspaceId: string): Promise<boolean> {
    if (!isMockStorageConfigured()) {
        return false;
    }

    try {
        return (await findOwningSecret(await readWorkspaceSecrets(), workspaceId)) !== null;
    } catch (caught) {
        logEvent("error", "mock_server.ownership_check_failed", { error: describeError(caught) });

        return false;
    }
}

export type ImportReport = {
    readonly ok: true;
    readonly serverId: string;
    readonly serverKey: string;
    readonly created: number;
    /**
     * How many of those carry a guard over required fields.
     *
     * Reported rather than left to be discovered, because a guard changes what
     * the mock answers: a route that used to reply 200 to anything now replies
     * 400 to a request missing a header. That is the point of it, and it is
     * still a thing the reader should be told in the same breath as the count.
     */
    readonly guarded: number;
    /** Operations the document had that could not be taken, with a reason. */
    readonly skipped: readonly { readonly path: string; readonly reason: string }[];
};

export type ImportResult = ImportReport | { readonly ok: false; readonly reason: string };

export async function importOpenApi(input: unknown): Promise<ImportResult> {
    const parsed = importSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_document" };
    }

    if (!(await ownsWorkspace(parsed.data.workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    const document = await parseOpenApiText(parsed.data.text);

    if (!document.ok) {
        return { ok: false, reason: document.reason };
    }

    const read = readOpenApi(document.document, {
        enforceRequired: parsed.data.enforceRequired ?? true,
    });

    if (read.endpoints.length === 0) {
        return { ok: false, reason: "no_operations" };
    }

    if (await isServerLimitReached(parsed.data.workspaceId)) {
        return { ok: false, reason: "server_limit_reached" };
    }

    const name = checkWorkspaceName(parsed.data.name || read.title || "Imported API");

    if (!name.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    const key =
        suggestServerKey(name.name) === ""
            ? createServerKey(cryptoRandomBytes)
            : suggestServerKey(name.name);

    const created = await insertServer({
        workspaceId: parsed.data.workspaceId,
        // A key drawn from the title may already be taken by another workspace,
        // so a collision falls back to a random one rather than failing an
        // import somebody just waited for.
        key,
        name: name.name,
    });

    const server = created.ok
        ? created
        : await insertServer({
              workspaceId: parsed.data.workspaceId,
              key: createServerKey(cryptoRandomBytes),
              name: name.name,
          });

    if (!server.ok) {
        return { ok: false, reason: server.reason };
    }

    const skipped = [...read.skipped];
    let inserted = 0;
    let guarded = 0;

    for (const endpoint of read.endpoints.slice(0, MAX_ENDPOINTS_PER_SERVER)) {
        const pattern = parsePathPattern(endpoint.path);

        if (!pattern.ok) {
            skipped.push({ path: endpoint.path, reason: pattern.reason });
            continue;
        }

        const result = await insertEndpoint({
            serverId: server.server.id,
            collectionId: null,
            name: endpoint.name,
            method: endpoint.method,
            parsed: pattern.parsed,
            // The whole document the reader built: the response shaped from the
            // schema, the declared request shape on the entry node, and the
            // guard when the operation marks anything required.
            graph: endpoint.graph,
        });

        if (!result.ok) {
            // Recorded rather than rolled back: 397 working endpoints and a
            // list beats an error and nothing.
            skipped.push({ path: endpoint.path, reason: result.reason });
            continue;
        }

        inserted += 1;

        if (endpoint.required.length > 0) {
            guarded += 1;
        }
    }

    return {
        ok: true,
        serverId: server.server.id,
        serverKey: server.server.key,
        created: inserted,
        guarded,
        skipped,
    };
}

const exportSchema = z.object({
    workspaceId: workspaceIdSchema,
    serverId: z.uuid(),
    baseUrl: z.string().max(512),
});

export type ExportResult =
    | { readonly ok: true; readonly document: string; readonly filename: string }
    | { readonly ok: false; readonly reason: string };

export async function exportOpenApi(input: unknown): Promise<ExportResult> {
    const parsed = exportSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if (!(await ownsWorkspace(parsed.data.workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    const server = await findServerDetail(parsed.data.workspaceId, parsed.data.serverId);

    if (server === null) {
        return { ok: false, reason: "not_found" };
    }

    const endpoints: ExportEndpoint[] = [];

    for (const summary of server.endpoints) {
        const detail = await findEndpoint(summary.id);

        if (detail === null) {
            continue;
        }

        endpoints.push({
            method: detail.method,
            path: detail.path,
            name: detail.name,
            status: detail.status,
            contentType: detail.contentType,
            // `toJson` returns null for a dynamic tree, and null is the honest
            // example for "this generates a different value every call".
            example: (toJson(detail.body) ?? null) as JsonValue,
        });
    }

    return {
        ok: true,
        filename: `${server.key}-openapi.json`,
        document: JSON.stringify(
            writeOpenApi(server.name, `${parsed.data.baseUrl}/m/${server.key}`, endpoints),
            null,
            4,
        ),
    };
}
