import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    MAX_VARIABLES_PER_WORKSPACE,
    type VariableRow,
    type VariableScope,
} from "../domain/environment";

/**
 * Environment variables, read and written.
 *
 * Every read is scoped to a workspace, so a query can never return a row that
 * belongs to somebody else even before `resolveEnvironment` filters by scope.
 * The two together are belt and braces on the one leak that would matter here.
 */

const SELECT = {
    scopeType: true,
    scopeId: true,
    environment: true,
    key: true,
    value: true,
    isSecret: true,
} as const;

export async function listVariables(workspaceId: string): Promise<readonly VariableRow[]> {
    const rows = await prisma.environmentVariable.findMany({
        where: { workspaceId },
        select: SELECT,
        orderBy: [{ environment: "asc" }, { key: "asc" }],
    });

    return rows.map((row) => ({ ...row, scopeType: row.scopeType as VariableScope }));
}

export async function countVariables(workspaceId: string): Promise<number> {
    return prisma.environmentVariable.count({ where: { workspaceId } });
}

export async function isVariableLimitReached(workspaceId: string): Promise<boolean> {
    return (await countVariables(workspaceId)) >= MAX_VARIABLES_PER_WORKSPACE;
}

export type UpsertVariableInput = {
    readonly workspaceId: string;
    readonly scopeType: VariableScope;
    readonly scopeId: string;
    readonly environment: string;
    readonly key: string;
    readonly value: string;
    readonly isSecret: boolean;
};

/**
 * Writes one variable, replacing any row with the same identity.
 *
 * `upsert` on the composite unique rather than delete-then-insert, so two tabs
 * saving the same key cannot leave the row missing between the two statements.
 */
export async function upsertVariable(input: UpsertVariableInput): Promise<boolean> {
    const identity = {
        scopeType_scopeId_environment_key: {
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            environment: input.environment,
            key: input.key,
        },
    };

    try {
        await prisma.environmentVariable.upsert({
            where: identity,
            create: input,
            update: { value: input.value, isSecret: input.isSecret },
        });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.variable_write_failed", { error: describeError(caught) });

        return false;
    }
}

export type DeleteVariableInput = {
    readonly scopeType: VariableScope;
    readonly scopeId: string;
    readonly environment: string;
    readonly key: string;
};

export async function deleteVariable(input: DeleteVariableInput): Promise<boolean> {
    try {
        await prisma.environmentVariable.delete({
            where: {
                scopeType_scopeId_environment_key: {
                    scopeType: input.scopeType,
                    scopeId: input.scopeId,
                    environment: input.environment,
                    key: input.key,
                },
            },
        });

        return true;
    } catch (caught) {
        logEvent("error", "mock_server.variable_delete_failed", { error: describeError(caught) });

        return false;
    }
}
