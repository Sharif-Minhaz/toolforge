"use server";

import { z } from "zod";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    checkEnvironmentName,
    checkVariableKey,
    forDisplay,
    listEnvironments,
    VARIABLE_SCOPES,
    VARIABLE_VALUE_LENGTH,
    type DisplayVariable,
} from "../domain/environment";
import { isMockStorageConfigured } from "../repository/config";
import { readWorkspaceSecrets } from "../repository/session";
import {
    deleteVariable,
    isVariableLimitReached,
    listVariables,
    upsertVariable,
} from "../repository/variables";
import { findOwningSecret } from "../repository/workspaces";
import type { ServerActionResult } from "../types";
import { workspaceIdSchema } from "../validation";

/**
 * Reading and writing a workspace's variables.
 *
 * A secret's value goes out of here exactly never: `forDisplay` masks it before
 * the list crosses the action boundary, so a browser cannot recover one even
 * with the network tab open. The value leaves the database only on the way into
 * an execution, which is the whole meaning of the flag.
 */

const upsertSchema = z.object({
    workspaceId: workspaceIdSchema,
    scopeType: z.enum(VARIABLE_SCOPES),
    scopeId: z.uuid(),
    environment: z.string().max(64),
    key: z.string().max(256),
    value: z.string().max(VARIABLE_VALUE_LENGTH.max),
    isSecret: z.boolean(),
});

const deleteSchema = z.object({
    workspaceId: workspaceIdSchema,
    scopeType: z.enum(VARIABLE_SCOPES),
    scopeId: z.uuid(),
    environment: z.string().max(64),
    key: z.string().max(256),
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

export type VariableView = {
    readonly variables: readonly DisplayVariable[];
    readonly environments: readonly string[];
};

export async function getVariables(workspaceId: unknown): Promise<VariableView> {
    const parsed = workspaceIdSchema.safeParse(workspaceId);

    if (!parsed.success || !(await ownsWorkspace(parsed.data))) {
        return { variables: [], environments: [] };
    }

    try {
        const rows = await listVariables(parsed.data);

        return { variables: forDisplay(rows), environments: listEnvironments(rows) };
    } catch (caught) {
        logEvent("error", "mock_server.variable_list_failed", { error: describeError(caught) });

        return { variables: [], environments: [] };
    }
}

export async function saveVariable(input: unknown): Promise<ServerActionResult> {
    const parsed = upsertSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_name" };
    }

    const key = checkVariableKey(parsed.data.key);

    if (!key.ok) {
        return {
            ok: false,
            reason: key.reason === "reserved_key" ? "key_reserved" : "invalid_key",
        };
    }

    const environment = checkEnvironmentName(parsed.data.environment);

    if (!environment.ok) {
        return { ok: false, reason: "invalid_name" };
    }

    if (!(await ownsWorkspace(parsed.data.workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    if (await isVariableLimitReached(parsed.data.workspaceId)) {
        return { ok: false, reason: "endpoint_limit_reached" };
    }

    const written = await upsertVariable({
        ...parsed.data,
        key: key.key,
        environment: environment.key,
    });

    return written ? { ok: true } : { ok: false, reason: "write_failed" };
}

export async function removeVariable(input: unknown): Promise<ServerActionResult> {
    const parsed = deleteSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "not_found" };
    }

    if (!(await ownsWorkspace(parsed.data.workspaceId))) {
        return { ok: false, reason: "not_owner" };
    }

    return (await deleteVariable(parsed.data))
        ? { ok: true }
        : { ok: false, reason: "write_failed" };
}
