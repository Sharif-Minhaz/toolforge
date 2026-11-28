import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { bytesToDataUri } from "@/modules/tools/domain/base64";
import { resolveHttpEndpoint } from "@/modules/tools/domain/endpoint";

import { GENERATION_TIMEOUT_MS, MAX_COMPLETION_TOKENS } from "../domain/constants";
import { OBJECT_JSON_SCHEMA, SYSTEM_PROMPT, USER_PROMPT } from "../domain/describe-request";
import { classifyWorkerFailure } from "../domain/generation";
import type { GenerationFailureReason } from "../types";

export type DescriberResult =
    | { readonly ok: true; readonly payload: unknown }
    | { readonly ok: false; readonly reason: GenerationFailureReason };

/** Unprefixed on purpose: a `NEXT_PUBLIC_` name would inline the URL into the browser bundle. */
function readConfiguredEndpoint(): string | null {
    const configured = process.env.IMAGE_TO_3D_API;

    return configured ? resolveHttpEndpoint(configured) : null;
}

/**
 * Whether this deployment has a worker and a key for it. Resolved on the
 * server and passed to the island as a prop, because the browser cannot know.
 */
export function isObjectDescriberConfigured(): boolean {
    return readConfiguredEndpoint() !== null && Boolean(process.env.IMAGE_TO_3D_API_KEY);
}

/** The worker's `{ error: { code, detail } }`, read without trusting any of it. */
function readError(payload: unknown): { code: string | null; detail: string } {
    if (typeof payload !== "object" || payload === null) {
        return { code: null, detail: "" };
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error !== "object" || error === null) {
        return { code: null, detail: "" };
    }

    const { code, detail } = error as { code?: unknown; detail?: unknown };

    return {
        code: typeof code === "string" ? code : null,
        // Capped and flattened: it goes into a log line, never onto the page.
        detail: typeof detail === "string" ? detail.replace(/\s+/g, " ").slice(0, 500) : "",
    };
}

/**
 * Asks the worker to describe the object in one picture.
 *
 * The only place the worker URL and its bearer key are read, so the key never
 * leaves the server. The prompt and the schema travel with every request —
 * the worker holds neither — which is what lets them change in a commit
 * rather than in a dashboard.
 */
export async function requestObjectDescription(
    bytes: Uint8Array,
    mimeType: string,
): Promise<DescriberResult> {
    const endpoint = readConfiguredEndpoint();
    const apiKey = process.env.IMAGE_TO_3D_API_KEY;

    if (!endpoint || !apiKey) {
        logEvent("error", "image_to_3d.describer_not_configured", {
            endpoint: Boolean(endpoint),
            apiKey: Boolean(apiKey),
        });

        return { ok: false, reason: "not_configured" };
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                system: SYSTEM_PROMPT,
                prompt: USER_PROMPT,
                image: bytesToDataUri(bytes, mimeType),
                schema: OBJECT_JSON_SCHEMA,
                max_tokens: MAX_COMPLETION_TOKENS,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
        });

        // Read once, whatever the status: the worker names its failures in the
        // body, and a spent day and an outage are both a 5xx without it.
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            const { code, detail } = readError(payload);
            const reason = classifyWorkerFailure(response.status, code, detail);

            logEvent("warn", "image_to_3d.describer_rejected", {
                status: response.status,
                code: code ?? "",
                reason,
                detail,
            });

            return { ok: false, reason };
        }

        return { ok: true, payload };
    } catch (caught) {
        logEvent("error", "image_to_3d.describer_request_failed", {
            error: describeError(caught),
        });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
