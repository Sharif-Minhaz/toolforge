import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

import {
    COLLECTION_NAME_LENGTH,
    ENDPOINT_NAME_LENGTH,
    MAX_PATH_LENGTH,
    MAX_RESPONSE_BYTES,
    MAX_STATUS_CODE,
    MIN_STATUS_CODE,
    RECOVERY_KEY_LENGTH,
    SERVER_KEY_LENGTH,
    SERVER_NAME_LENGTH,
    WORKSPACE_NAME_LENGTH,
} from "../domain/constants";
import { HTTP_METHODS } from "../types/graph";

/**
 * The shape of everything crossing a Server Action boundary into the studio.
 *
 * Only that the right *kind* of thing arrived. Whether a name is usable after
 * whitespace collapses, whether a recovery key survives Crockford folding, and
 * whether the caller owns the workspace are all semantic questions, and they
 * stay in `domain/` and `repository/` where they can return a reason the UI can
 * name. A Zod failure here means somebody bypassed the form.
 */

export const turnstileTokenSchema = z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH);

/**
 * Bounded generously rather than exactly, and normalised nowhere.
 * `checkWorkspaceName` owns the real rule, and letting a name that is only
 * whitespace reach it is what produces "give it a name" instead of a bare
 * "invalid input".
 */
export const workspaceNameSchema = z
    .string()
    .max(WORKSPACE_NAME_LENGTH.max * 4)
    .describe("collapsed and length-checked by checkWorkspaceName");

/**
 * Four times the canonical length, because every separator a person types
 * survives to this point — `normalizeRecoveryKey` is what strips them. Bounded
 * all the same, so a megabyte paste is refused before it is scanned.
 */
export const recoveryKeySchema = z
    .string()
    .min(1)
    .max(RECOVERY_KEY_LENGTH * 4);

export const workspaceIdSchema = z.uuid();

export const createWorkspaceSchema = z.object({
    name: workspaceNameSchema,
    token: turnstileTokenSchema,
});

export const importWorkspaceSchema = z.object({
    recoveryKey: recoveryKeySchema,
    token: turnstileTokenSchema,
});

export const renameWorkspaceSchema = z.object({
    workspaceId: workspaceIdSchema,
    name: workspaceNameSchema,
});

export const workspaceRefSchema = z.object({
    workspaceId: workspaceIdSchema,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export type ImportWorkspaceInput = z.infer<typeof importWorkspaceSchema>;

export type RenameWorkspaceInput = z.infer<typeof renameWorkspaceSchema>;

export type WorkspaceRefInput = z.infer<typeof workspaceRefSchema>;

// ─── Servers, collections and endpoints ─────────────────────────────────────

export const serverNameSchema = z
    .string()
    .min(1)
    .max(SERVER_NAME_LENGTH.max * 4);

/**
 * Bounded, not validated. `checkServerKey` owns the real rule and is what
 * produces "keys cannot start with a hyphen" rather than "invalid input".
 * Empty is allowed on the way in and means "draw me one".
 */
export const serverKeySchema = z.string().max(SERVER_KEY_LENGTH.max * 2);

export const serverIdSchema = z.uuid();

export const collectionIdSchema = z.uuid();

export const endpointIdSchema = z.uuid();

export const httpMethodSchema = z.enum(HTTP_METHODS);

export const pathPatternSchema = z.string().max(MAX_PATH_LENGTH * 2);

export const statusCodeSchema = z.number().int().min(MIN_STATUS_CODE).max(MAX_STATUS_CODE);

export const contentTypeSchema = z.string().max(128);

export const headerRowsSchema = z
    .array(z.object({ name: z.string().max(128), value: z.string().max(2_048) }))
    .max(30);

/**
 * The response body arrives as text and is parsed here rather than as a nested
 * Zod shape, because until M2's tree editor exists the reader is typing JSON by
 * hand and the useful failure is "line 3 is not valid JSON", not a schema
 * mismatch six levels down. `parseBodyText` in `domain/` owns that message.
 */
export const bodyTextSchema = z.string().max(MAX_RESPONSE_BYTES);

export const createServerSchema = z.object({
    workspaceId: workspaceIdSchema,
    name: serverNameSchema,
    key: serverKeySchema,
});

export const updateServerSchema = z.object({
    serverId: serverIdSchema,
    name: serverNameSchema,
    description: z.string().max(280).optional(),
    isPaused: z.boolean(),
});

export const serverRefSchema = z.object({ serverId: serverIdSchema });

export const createCollectionSchema = z.object({
    serverId: serverIdSchema,
    parentId: collectionIdSchema.nullable(),
    name: z
        .string()
        .min(1)
        .max(COLLECTION_NAME_LENGTH.max * 4),
});

export const renameCollectionSchema = z.object({
    collectionId: collectionIdSchema,
    name: z
        .string()
        .min(1)
        .max(COLLECTION_NAME_LENGTH.max * 4),
});

export const collectionRefSchema = z.object({ collectionId: collectionIdSchema });

export const createEndpointSchema = z.object({
    serverId: serverIdSchema,
    collectionId: collectionIdSchema.nullable(),
    name: z
        .string()
        .min(1)
        .max(ENDPOINT_NAME_LENGTH.max * 4),
    method: httpMethodSchema,
    path: pathPatternSchema,
});

export const updateEndpointSchema = z.object({
    endpointId: endpointIdSchema,
    name: z
        .string()
        .min(1)
        .max(ENDPOINT_NAME_LENGTH.max * 4),
    method: httpMethodSchema,
    path: pathPatternSchema,
    isEnabled: z.boolean(),
    status: statusCodeSchema,
    contentType: contentTypeSchema,
    headers: headerRowsSchema,
    bodyText: bodyTextSchema,
    /** Optimistic-concurrency token; the save asserts the version it read. */
    version: z.number().int().min(1),
});

export const endpointRefSchema = z.object({ endpointId: endpointIdSchema });

export type CreateServerInput = z.infer<typeof createServerSchema>;

export type UpdateServerInput = z.infer<typeof updateServerSchema>;

export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;

export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>;
