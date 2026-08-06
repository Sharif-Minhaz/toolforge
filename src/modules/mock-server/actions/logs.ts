"use server";

import { z } from "zod";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { isMockStorageConfigured } from "../repository/config";
import { clearWorkspaceLogs, listRequestLogs } from "../repository/logs";
import { readWorkspaceSecrets } from "../repository/session";
import { findOwningSecret } from "../repository/workspaces";
import type { RequestLogRow, ServerActionResult } from "../types";
import { MAX_LOG_SEARCH_LENGTH } from "../domain/constants";
import { workspaceIdSchema } from "../validation";

/**
 * Reading and clearing a workspace's request logs.
 *
 * Behind the same ownership gate as everything else, and for a sharper reason
 * than usual: a log row records what somebody's own code sent to their own
 * mock, which is a far more revealing thing than the mock's configuration. It
 * is redacted on the way in, and it is still nobody else's to read.
 */

const MAX_ROWS = 200;

const listSchema = z.object({
    workspaceId: workspaceIdSchema,
    serverId: z.uuid().optional(),
    search: z.string().max(MAX_LOG_SEARCH_LENGTH).optional(),
    status: z.number().int().min(100).max(599).optional(),
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

export async function getRequestLogs(input: unknown): Promise<readonly RequestLogRow[]> {
    const parsed = listSchema.safeParse(input);

    if (!parsed.success || !(await ownsWorkspace(parsed.data.workspaceId))) {
        return [];
    }

    try {
        return await listRequestLogs({ ...parsed.data, limit: MAX_ROWS });
    } catch (caught) {
        logEvent("error", "mock_server.log_list_failed", { error: describeError(caught) });

        return [];
    }
}

export async function clearLogs(input: unknown): Promise<ServerActionResult> {
    const parsed = z.object({ workspaceId: workspaceIdSchema }).safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if (!(await ownsWorkspace(parsed.data.workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    return (await clearWorkspaceLogs(parsed.data.workspaceId))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}
