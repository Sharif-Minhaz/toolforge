import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { resolveHttpEndpoint } from "@/modules/tools/domain/endpoint";

import { IMAGE_FORM_FIELD, RECOGNITION_TIMEOUT_MS } from "../domain/constants";
import type { RecognitionFailureReason } from "../types";

export type RecognizerRequestResult =
    | { readonly ok: true; readonly payload: unknown }
    | { readonly ok: false; readonly reason: RecognitionFailureReason };

/**
 * The worker URL carries a `NEXT_PUBLIC_` prefix in the shipped `example.env`.
 * The browser never calls it directly, so the unprefixed name is preferred and
 * the old one still resolves — an existing `.env` keeps working either way.
 *
 * No `defaultPath`: this worker answers POST at whatever route it is mounted
 * at, so the variable has to carry the full URL. The watermark remover's worker
 * is the same shape; the detectors' are not, which is why they pass one.
 */
function readConfiguredEndpoint(): string | null {
    const configured = process.env.MATH_KATEX_API ?? process.env.NEXT_PUBLIC_MATH_KATEX_API;

    return configured ? resolveHttpEndpoint(configured) : null;
}

/**
 * Whether this deployment can read a picture at all.
 *
 * Resolved on the server and passed to the island as a prop, because whether a
 * worker URL and a key exist is not something the browser can know — and a
 * button that cannot work is worse than an absent one.
 */
export function isEquationRecognizerConfigured(): boolean {
    return readConfiguredEndpoint() !== null && Boolean(process.env.MATH_KATEX_API_KEY);
}

/**
 * The recognizer's own error codes, mapped to reasons this side already has
 * names for.
 *
 * Read before the HTTP status, because the two disagree on purpose in one
 * place: `EQUATION_NOT_DETECTED` comes back with **200**, since the call
 * succeeded and the answer is "there is no equation here". A status-only
 * mapping would report that as success and hand the reader an empty list.
 */
const CODE_REASONS: Record<string, RecognitionFailureReason> = {
    UNAUTHORIZED: "unauthorized",
    RATE_LIMITED: "rate_limited",
    INVALID_INPUT: "invalid_request",
    IMAGE_TOO_LARGE: "too_large",
    IMAGE_TOO_SMALL: "too_small",
    MODEL_ERROR: "upstream_unavailable",
    LATEX_INVALID: "unreadable_response",
    EQUATION_NOT_DETECTED: "no_equation",
};

/** HTTP status → the reason the reader is shown, when the body names none. */
function describeStatus(status: number): RecognitionFailureReason {
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
 * Pulls the recognizer's own code out of a reply, whatever its status.
 *
 * Deliberately tolerant: this runs on a body that may be anything at all, and
 * a reply it cannot read is not a crash, it is `null` and the status decides.
 */
function readErrorCode(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) {
        return null;
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error !== "object" || error === null) {
        return null;
    }

    const code = (error as { code?: unknown }).code;

    return typeof code === "string" ? code : null;
}

/**
 * Calls the Cloudflare Worker that fronts the vision model.
 *
 * The only place the worker URL and its bearer key are read, so the key never
 * leaves the server and no other layer can reach the network on its behalf.
 *
 * The upload is forwarded as multipart rather than re-encoded: the worker does
 * the base64 conversion the model needs, and passing the original bytes keeps
 * the pixels the reader chose exactly as they were.
 */
export async function requestEquationRecognition(image: File): Promise<RecognizerRequestResult> {
    const endpoint = readConfiguredEndpoint();
    const apiKey = process.env.MATH_KATEX_API_KEY;

    if (!endpoint || !apiKey) {
        logEvent("error", "equation.recognizer_not_configured", {
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
            signal: AbortSignal.timeout(RECOGNITION_TIMEOUT_MS),
        });

        // Read once, whatever the status: the recognizer names its own failures
        // in the body, and on a 200 with `success: false` the body is the only
        // place the reason exists at all.
        const payload = await response.json().catch(() => null);
        const code = readErrorCode(payload);
        const named = code === null ? undefined : CODE_REASONS[code];

        if (named !== undefined) {
            logEvent("warn", "equation.recognizer_refused", { status: response.status, code });

            return { ok: false, reason: named };
        }

        if (!response.ok) {
            const reason = describeStatus(response.status);

            logEvent("warn", "equation.recognizer_rejected", {
                status: response.status,
                reason,
                // A code the worker grew after this map was written. Logged by
                // name so the gap is visible, rather than swallowed as a
                // generic upstream failure nobody investigates.
                code: code ?? "",
            });

            return { ok: false, reason };
        }

        return { ok: true, payload };
    } catch (caught) {
        logEvent("error", "equation.recognizer_request_failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
