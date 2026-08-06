"use server";

import { z } from "zod";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { isMultipartType, parseRequestBody } from "../domain/request-body";
import {
    EMPTY_OBSERVED_SHAPE,
    mergeObservedPaths,
    type ObservedShape,
} from "../domain/suggest-path";
import { isMockStorageConfigured } from "../repository/config";
import { listRequestLogs } from "../repository/logs";
import { readWorkspaceSecrets } from "../repository/session";
import { listVariables } from "../repository/variables";
import { findOwningSecret } from "../repository/workspaces";
import type { JsonValue } from "../types/graph";
import { workspaceIdSchema } from "../validation";

/**
 * What recent traffic to one route was shaped like, and what names exist to
 * reference — everything the path pickers in the value editor need.
 *
 * **Keys travel, values do not.** A log row holds a redacted copy of what
 * somebody's own code sent, and the picker needs to know that `avatar.size`
 * exists, never what it was. Reducing rows to paths *here*, on the server,
 * rather than shipping two hundred bodies to the browser and walking them
 * there, is the difference between a few hundred bytes and a couple of
 * megabytes — and it means a body this feature has no use for never leaves the
 * database at all.
 *
 * Behind the same ownership gate as the logs themselves, for the same reason:
 * the shape of a request is nearly as revealing as its contents.
 *
 * One call answers three pickers — request paths, environment keys — because
 * they are all opened from the same editor and a round trip each would be three
 * for no gain.
 */

const inputSchema = z.object({
    workspaceId: workspaceIdSchema,
    serverId: z.uuid(),
    endpointId: z.uuid(),
});

/**
 * How many recent requests the shape is read from.
 *
 * Small on purpose. The union of twenty-five requests to one route covers the
 * optional fields a caller sometimes omits, and reading two hundred would
 * mostly re-derive the same paths at eight times the cost.
 */
const SHAPE_SAMPLES = 25;

export type RequestShapeResult = {
    readonly observed: ObservedShape;
    /** Environment variable names in this workspace, for the `env` picker. */
    readonly envKeys: readonly string[];
};

const NOTHING: RequestShapeResult = { observed: EMPTY_OBSERVED_SHAPE, envKeys: [] };

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

/**
 * A logged body back to a value.
 *
 * An upload is already stored parsed — `loggableBody` in `repository/handle.ts`
 * replaces the raw multipart bytes with the object they parsed to, so that file
 * contents never reach the log table. Re-running the multipart parser over that
 * JSON would find no boundary and hand back the text. Everything else is stored
 * as it arrived and goes through the ordinary parser.
 *
 * Total: a truncated or malformed body degrades to text, which contributes no
 * paths, rather than failing the whole request.
 */
function loggedBodyValue(preview: string, contentType: string): JsonValue {
    if (preview === "") {
        return null;
    }

    if (isMultipartType(contentType)) {
        try {
            return JSON.parse(preview) as JsonValue;
        } catch {
            return null;
        }
    }

    return parseRequestBody(preview, contentType);
}

export async function getRequestShape(input: unknown): Promise<RequestShapeResult> {
    const parsed = inputSchema.safeParse(input);

    if (!parsed.success || !(await ownsWorkspace(parsed.data.workspaceId))) {
        return NOTHING;
    }

    try {
        const [rows, variables] = await Promise.all([
            listRequestLogs({
                workspaceId: parsed.data.workspaceId,
                serverId: parsed.data.serverId,
                endpointId: parsed.data.endpointId,
                limit: SHAPE_SAMPLES,
            }),
            listVariables(parsed.data.workspaceId),
        ]);

        const headers = new Set<string>();
        const query = new Set<string>();

        for (const row of rows) {
            for (const name of Object.keys(row.request.headers)) {
                headers.add(name.toLowerCase());
            }

            for (const name of Object.keys(row.request.query)) {
                query.add(name);
            }
        }

        return {
            observed: {
                // Newest first, which is the order `listRequestLogs` returns and
                // the order `mergeObservedPaths` resolves a type conflict in.
                body: mergeObservedPaths(
                    rows.map((row) =>
                        loggedBodyValue(
                            row.request.bodyPreview,
                            row.request.headers["content-type"] ?? "",
                        ),
                    ),
                ),
                query: [...query].toSorted(),
                headers: [...headers].toSorted(),
                samples: rows.length,
            },
            envKeys: [...new Set(variables.map((row) => row.key))].toSorted(),
        };
    } catch (caught) {
        logEvent("error", "mock_server.request_shape_failed", { error: describeError(caught) });

        return NOTHING;
    }
}
