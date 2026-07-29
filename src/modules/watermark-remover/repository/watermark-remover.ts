import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { resolveHttpEndpoint } from "@/modules/tools/domain/endpoint";
import {
    IMAGE_FORM_FIELD,
    MASK_FORM_FIELD,
    MAX_RESULT_BYTES,
    MAX_UPSTREAM_ERROR_LENGTH,
    REMOVAL_TIMEOUT_MS,
} from "../domain/constants";
import type { WatermarkFailureReason } from "../types";

export type WatermarkWorkerResult =
    | { readonly ok: true; readonly png: ArrayBuffer }
    | { readonly ok: false; readonly reason: WatermarkFailureReason };

/**
 * The worker URL carries a `NEXT_PUBLIC_` prefix in the shipped `example.env`.
 * The browser never calls it directly, so the unprefixed name is preferred and
 * the old one still resolves — an existing `.env` keeps working either way.
 *
 * No default path: this worker answers `POST` on whatever route it is mounted at.
 */
function readConfiguredEndpoint(): string | null {
    const configured =
        process.env.WATERMARK_REMOVER_API ?? process.env.NEXT_PUBLIC_WATERMARK_REMOVER_API;

    return configured ? resolveHttpEndpoint(configured) : null;
}

/**
 * The worker's own account of what went wrong, collapsed onto one line so it
 * survives a JSON log field, and capped so a stack trace cannot flood the log.
 *
 * Never throws: this runs on a path that is already failing, and a body that
 * cannot be read must not replace a useful status with an unexplained crash.
 */
async function readErrorDetail(response: Response): Promise<string> {
    try {
        const body = await response.text();

        return body.replace(/\s+/g, " ").trim().slice(0, MAX_UPSTREAM_ERROR_LENGTH);
    } catch {
        return "";
    }
}

/** HTTP status → the reason the reader is shown. */
function describeStatus(status: number): WatermarkFailureReason {
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
 * Calls the Cloudflare Worker that fronts the inpainting model. The only place
 * the worker URL and its bearer key are read, so the key never leaves the server
 * and no other layer can reach the network on its behalf.
 *
 * Both files are forwarded as multipart, exactly as the browser produced them:
 * the crop and its mask have to stay pixel-aligned, and re-encoding either one
 * here is a chance to break that alignment for no gain.
 */
export async function requestWatermarkRemoval(
    image: File,
    mask: File,
): Promise<WatermarkWorkerResult> {
    const endpoint = readConfiguredEndpoint();
    const apiKey = process.env.WATERMARK_REMOVER_API_KEY;

    if (!endpoint || !apiKey) {
        logEvent("error", "watermark_remover.not_configured", {
            endpoint: Boolean(endpoint),
            apiKey: Boolean(apiKey),
        });

        return { ok: false, reason: "not_configured" };
    }

    const body = new FormData();

    body.set(IMAGE_FORM_FIELD, image, image.name);
    body.set(MASK_FORM_FIELD, mask, mask.name);

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            // No Content-Type: `fetch` has to set it itself so the multipart
            // boundary matches the body it generated.
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(REMOVAL_TIMEOUT_MS),
        });

        if (!response.ok) {
            const reason = describeStatus(response.status);

            logEvent("warn", "watermark_remover.upstream_rejected", {
                status: response.status,
                reason,
                detail: await readErrorDetail(response),
            });

            return { ok: false, reason };
        }

        // The worker answers with the PNG itself and with `text/plain` for every
        // failure it handles, so the content type is what separates a repainted
        // square from an error message rendered as one.
        const contentType = response.headers.get("content-type") ?? "";

        if (!contentType.startsWith("image/")) {
            logEvent("error", "watermark_remover.unexpected_content_type", { contentType });

            return { ok: false, reason: "unreadable_response" };
        }

        const png = await response.arrayBuffer();

        if (png.byteLength === 0) {
            logEvent("error", "watermark_remover.empty_result");

            return { ok: false, reason: "unreadable_response" };
        }

        if (png.byteLength > MAX_RESULT_BYTES) {
            logEvent("error", "watermark_remover.oversized_result", { bytes: png.byteLength });

            return { ok: false, reason: "oversized_result" };
        }

        return { ok: true, png };
    } catch (caught) {
        logEvent("error", "watermark_remover.request_failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
