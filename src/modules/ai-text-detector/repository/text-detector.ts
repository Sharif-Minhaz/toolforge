import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { DETECTION_REQUEST_TIMEOUT_MS } from "../domain/constants";
import type { DetectionFailureReason } from "../types";

export type DetectorRequestResult =
    | { readonly ok: true; readonly payload: unknown }
    | { readonly ok: false; readonly reason: DetectionFailureReason };

/**
 * The worker URL was originally exposed with a `NEXT_PUBLIC_` prefix. Now that
 * the browser never calls it directly, the unprefixed name is preferred and the
 * old one still resolves so an existing `.env` keeps working.
 */
function resolveEndpoint(): string | undefined {
    return process.env.TEXT_DETECTOR_API ?? process.env.NEXT_PUBLIC_TEXT_DETECTOR_API;
}

/** HTTP status → the reason the reader is shown. */
function describeStatus(status: number): DetectionFailureReason {
    if (status === 401 || status === 403) {
        return "unauthorized";
    }

    if (status === 429) {
        return "rate_limited";
    }

    return status >= 400 && status < 500 ? "invalid_request" : "upstream_unavailable";
}

/**
 * Calls the Cloudflare Worker that fronts the detection model. The only place
 * the worker URL and its bearer key are read, so the key never leaves the
 * server and no other layer can reach the network on its behalf.
 */
export async function requestDetection(text: string): Promise<DetectorRequestResult> {
    const endpoint = resolveEndpoint();
    const apiKey = process.env.TEXT_DETECTOR_API_KEY;

    if (!endpoint || !apiKey) {
        logEvent("error", "ai_text_detector.not_configured", {
            endpoint: Boolean(endpoint),
            apiKey: Boolean(apiKey),
        });

        return { ok: false, reason: "not_configured" };
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ text }),
            cache: "no-store",
            signal: AbortSignal.timeout(DETECTION_REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            const reason = describeStatus(response.status);

            logEvent("warn", "ai_text_detector.upstream_rejected", {
                status: response.status,
                reason,
            });

            return { ok: false, reason };
        }

        return { ok: true, payload: await response.json() };
    } catch (caught) {
        logEvent("error", "ai_text_detector.request_failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
