import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { resolveHttpEndpoint } from "@/modules/tools/domain/endpoint";
import { DETECT_PATH, IMAGE_DETECTION_TIMEOUT_MS, IMAGE_FORM_FIELD } from "../domain/constants";
import type { ImageDetectionFailureReason } from "../types";

export type ImageDetectorRequestResult =
    | { readonly ok: true; readonly payload: unknown }
    | { readonly ok: false; readonly reason: ImageDetectionFailureReason };

/**
 * The worker URL carries a `NEXT_PUBLIC_` prefix in the shipped `example.env`.
 * The browser never calls it directly, so the unprefixed name is preferred and
 * the old one still resolves — an existing `.env` keeps working either way.
 */
function readConfiguredEndpoint(): string | null {
    const configured =
        process.env.FAKE_IMAGE_DETECTOR_API ?? process.env.NEXT_PUBLIC_FAKE_IMAGE_DETECTOR_API;

    return configured ? resolveHttpEndpoint(configured, { defaultPath: DETECT_PATH }) : null;
}

/** HTTP status → the reason the reader is shown. */
function describeStatus(status: number): ImageDetectionFailureReason {
    if (status === 401 || status === 403) {
        return "unauthorized";
    }

    if (status === 429) {
        return "rate_limited";
    }

    if (status === 413) {
        return "too_large";
    }

    if (status === 415) {
        return "unsupported_type";
    }

    return status >= 400 && status < 500 ? "invalid_request" : "upstream_unavailable";
}

/**
 * Calls the Cloudflare Worker that fronts the vision model. The only place the
 * worker URL and its bearer key are read, so the key never leaves the server
 * and no other layer can reach the network on its behalf.
 *
 * The upload is forwarded as multipart rather than re-encoded: the worker does
 * the base64 conversion the model needs, and passing the original bytes keeps
 * the pixels the reader chose exactly as they were.
 */
export async function requestImageDetection(image: File): Promise<ImageDetectorRequestResult> {
    const endpoint = readConfiguredEndpoint();
    const apiKey = process.env.FAKE_IMAGE_DETECTOR_API_KEY;

    if (!endpoint || !apiKey) {
        logEvent("error", "ai_image_detector.not_configured", {
            endpoint: Boolean(endpoint),
            apiKey: Boolean(apiKey),
        });

        return { ok: false, reason: "not_configured" };
    }

    const body = new FormData();

    body.set(IMAGE_FORM_FIELD, image, image.name);

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            // No Content-Type: `fetch` has to set it itself so the multipart
            // boundary matches the body it generated.
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(IMAGE_DETECTION_TIMEOUT_MS),
        });

        if (!response.ok) {
            const reason = describeStatus(response.status);

            logEvent("warn", "ai_image_detector.upstream_rejected", {
                status: response.status,
                reason,
            });

            return { ok: false, reason };
        }

        return { ok: true, payload: await response.json() };
    } catch (caught) {
        logEvent("error", "ai_image_detector.request_failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
