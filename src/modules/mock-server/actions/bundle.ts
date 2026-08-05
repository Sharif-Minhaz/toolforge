"use server";

import { z } from "zod";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { buildBundle, bundleFilename, serializeBundle } from "../domain/bundle";
import { isMockStorageConfigured } from "../repository/config";
import { findEndpoint } from "../repository/endpoints";
import { findServerDetail } from "../repository/servers";
import { readWorkspaceSecrets } from "../repository/session";
import { findOwningSecret } from "../repository/workspaces";
import type { HttpMethod } from "../types/graph";
import { serverIdSchema, workspaceIdSchema } from "../validation";

/**
 * A whole mock server, downloaded as one JSON file.
 *
 * Behind the same ownership gate as everything else in this module, and for the
 * same reason it is not a route handler: there is no third-party client here,
 * only this page asking for its own work back. A GET endpoint returning a
 * workspace's servers would be one guessable id away from being a way to read
 * somebody else's.
 *
 * Endpoints are fetched one at a time because `findServerDetail` deliberately
 * returns summaries — the graph is the heavy column and the list view must not
 * pull it. Here it is exactly what is wanted, so the cost is the point.
 */

const exportSchema = z.object({
    workspaceId: workspaceIdSchema,
    serverId: serverIdSchema,
});

export type BundleExport =
    | { readonly ok: true; readonly filename: string; readonly document: string }
    | { readonly ok: false; readonly reason: "not_owner" | "not_found" | "write_failed" };

export async function exportServerBundle(input: unknown): Promise<BundleExport> {
    const parsed = exportSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if (!isMockStorageConfigured()) {
        return { ok: false, reason: "not_found" };
    }

    try {
        const owns =
            (await findOwningSecret(await readWorkspaceSecrets(), parsed.data.workspaceId)) !==
            null;

        if (!owns) {
            return { ok: false, reason: "not_owner" };
        }

        const server = await findServerDetail(parsed.data.workspaceId, parsed.data.serverId);

        if (server === null) {
            return { ok: false, reason: "not_found" };
        }

        const endpoints = [];

        for (const summary of server.endpoints) {
            const detail = await findEndpoint(summary.id);

            if (detail === null) {
                // Deleted between the list and the read. One route short beats
                // failing an export of the other ninety-nine.
                continue;
            }

            endpoints.push({
                method: detail.method as HttpMethod,
                path: detail.path,
                name: detail.name,
                description: null,
                isEnabled: detail.isEnabled,
                graph: detail.graph,
            });
        }

        const bundle = buildBundle({
            key: server.key,
            name: server.name,
            description: server.description,
            isPaused: server.isPaused,
            endpoints,
        });

        return {
            ok: true,
            // Dated here rather than in `domain/`, which owns no clock — and
            // deliberately in the name rather than in the file, so two exports
            // of unchanged work still diff as identical.
            filename: bundleFilename(server.key, new Date()),
            document: serializeBundle(bundle),
        };
    } catch (caught) {
        logEvent("error", "mock_server.bundle_export_failed", { error: describeError(caught) });

        return { ok: false, reason: "write_failed" };
    }
}
